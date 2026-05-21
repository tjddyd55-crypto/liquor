import { randomInt, randomUUID } from 'node:crypto'
import { parseGaId } from './lib/parseGaId.js'
import { systemQuery } from './utils/dbSafeQuery.js'
import { sendVerificationCode } from './services/smsService.js'
import { consumeSmsVerificationCode } from './services/consumeSmsVerificationCode.js'
import { runAccountResetDataOnClient } from './services/accountResetService.js'
import { assertNotVerifyLocked, recordVerifyFailure, clearVerifyFailures } from './services/smsRateLimit.js'
import { assertPhoneSms10MinLimit, recordPhoneSms10MinSend } from './services/smsPhoneWindowLimit.js'
import { logSmsVerifyFailure } from './services/smsStructuredLog.js'
import { assertSmsRequestIpLimit, getClientIp, getClientUserAgent } from './services/smsRequestIpLimit.js'
import { assertNotSmsAccountLocked, recordUserSmsVerificationFailure } from './services/smsAccountLock.js'
import {
  clearUserSmsRequestQuota,
  incrementLatestSmsCodeFailures,
  insertSmsVerificationLog,
} from './services/smsVerificationAudit.js'
import { applyUserSmsRequestAfterSend, evaluateUserSmsRequestQuota } from './services/smsUserDbRate.js'
import { normalizeKrMobile, validateKrMobileDigits } from './lib/phoneNormalize.js'
import { SMS_PUBLIC_DELAY_MESSAGE } from './services/smsPublicMessages.js'
import { exposeSmsDebugCode } from './lib/smsDebugExposure.js'

const SMS_PURPOSE_PASSWORD_RESET = 'PASSWORD_RESET'
const SMS_PURPOSE_ACCOUNT_RESET = 'ACCOUNT_RESET'

/** 비밀번호 재설정 API — 계정 존재 여부 등 노출 방지 */
const PUBLIC_AUTH_MSG = '요청을 처리할 수 없습니다.'

function jsonPublicAuth(res, status, extra = {}) {
  res.status(status).json({ message: PUBLIC_AUTH_MSG, ...extra })
}

function logSmsEvent(label, meta) {
  console.info(`[sms-auth] ${label}`, meta)
}

function requireEndUser(req, res, next) {
  if (req.user?.role !== 'USER') {
    res.status(403).json({ message: '일반 설계사(USER) 계정만 이용할 수 있습니다.' })
    return
  }
  next()
}

async function loadActiveUserByUsername(pool, normalizedUsername) {
  const r = await systemQuery(
    pool,
    `
    SELECT id, username, phone_number, role, status, is_deleted, sms_blocked_until, ga_id
    FROM users
    WHERE username = $1 AND is_deleted = false
    `,
    [normalizedUsername],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {typeof import('bcryptjs')} ctx.bcrypt
 * @param {Function} ctx.validateCredentials (username, password) => string | null  — 재설정용 newPassword 검증 시 username 더미
 * @param {Function} ctx.handleDbError
 * @param {boolean} ctx.RUNNING_IN_PRODUCTION
 * @param {Function} ctx.requireAuth
 */
export function registerAuthAccountSmsApi(apiRouter, ctx) {
  const {
    pool,
    bcrypt,
    validateCredentials,
    handleDbError,
    RUNNING_IN_PRODUCTION,
    requireAuth,
  } = ctx

  const showDebugCode = exposeSmsDebugCode(RUNNING_IN_PRODUCTION)

  apiRouter.post('/auth/request-password-reset-code', async (req, res) => {
    const clientIp = getClientIp(req)
    const client = await pool.connect()
    let phoneNorm = ''
    let code = ''
    let newCodeRowId
    let user
    let quota
    let userGa
    try {
      const ipLimit = await assertSmsRequestIpLimit(req)
      if (!ipLimit.ok) {
        jsonPublicAuth(res, 429, { retryAfterSec: ipLimit.retryAfterSec })
        return
      }

      const usernameNorm = String(req.body?.username ?? '').trim()
      phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        jsonPublicAuth(res, 400)
        return
      }
      if (!usernameNorm || usernameNorm.length < 3) {
        jsonPublicAuth(res, 400)
        return
      }

      const burst = await assertPhoneSms10MinLimit(phoneNorm)
      if (!burst.ok) {
        jsonPublicAuth(res, 429, { retryAfterSec: burst.retryAfterSec })
        return
      }

      await client.query('BEGIN')
      const lockR = await client.query(
        `
        SELECT
          id, username, phone_number, role, status, is_deleted, ga_id,
          last_sms_requested_at, sms_request_count, sms_request_window_start,
          sms_blocked_until
        FROM users
        WHERE username = $1 AND is_deleted = false
        FOR UPDATE
        `,
        [usernameNorm],
      )
      user = lockR.rows[0]
      if (!user) {
        await client.query('ROLLBACK')
        console.error('[sms-auth] request-password-reset-code denied', {
          reason: 'username_not_found',
          username: usernameNorm,
        })
        jsonPublicAuth(res, 400)
        return
      }
      if (String(user.role ?? '').toUpperCase() !== 'USER') {
        await client.query('ROLLBACK')
        console.error('[sms-auth] request-password-reset-code denied', {
          reason: 'role_not_user',
          username: usernameNorm,
        })
        jsonPublicAuth(res, 400)
        return
      }
      if (String(user.status ?? '').toLowerCase() !== 'active') {
        await client.query('ROLLBACK')
        console.error('[sms-auth] request-password-reset-code denied', {
          reason: 'status_not_active',
          username: usernameNorm,
        })
        jsonPublicAuth(res, 400)
        return
      }
      if (normalizeKrMobile(user.phone_number) !== phoneNorm) {
        await client.query('ROLLBACK')
        console.error('[sms-auth] request-password-reset-code denied', {
          reason: 'phone_mismatch',
          username: usernameNorm,
        })
        jsonPublicAuth(res, 400)
        return
      }

      userGa = parseGaId(user.ga_id)
      if (userGa == null) {
        await client.query('ROLLBACK')
        console.error('[sms-auth] request-password-reset-code denied', { reason: 'ga_missing', userId: user.id })
        jsonPublicAuth(res, 500)
        return
      }

      const acctLock = assertNotSmsAccountLocked(user)
      if (!acctLock.ok) {
        await client.query('ROLLBACK')
        jsonPublicAuth(res, 429, {
          retryAfterSec: acctLock.retryAfterSec,
          retryAfterMin: acctLock.retryAfterMin,
        })
        return
      }

      quota = evaluateUserSmsRequestQuota(user)
      if (!quota.ok) {
        await client.query('ROLLBACK')
        jsonPublicAuth(res, 429, { retryAfterSec: quota.retryAfterSec })
        return
      }

      await client.query(
        `
        UPDATE sms_verification_codes SET used = true
        WHERE purpose = $1 AND user_id = $2 AND used = false
        `,
        [SMS_PURPOSE_PASSWORD_RESET, user.id],
      )

      code = String(randomInt(100_000, 1_000_000))
      const ins = await client.query(
        `
        INSERT INTO sms_verification_codes
          (purpose, user_id, username, phone_number, code, expires_at)
        VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '3 minutes')
        RETURNING id
        `,
        [SMS_PURPOSE_PASSWORD_RESET, user.id, usernameNorm, phoneNorm, code],
      )
      newCodeRowId = ins.rows[0]?.id

      await client.query('COMMIT')
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      console.error('[sms-auth] request-password-reset-code', e)
      jsonPublicAuth(res, 500)
      return
    } finally {
      client.release()
    }

    const smsResult = await sendVerificationCode({
      phoneNumber: phoneNorm,
      code,
      purpose: SMS_PURPOSE_PASSWORD_RESET,
      clientIp,
    })

    if (!smsResult?.success) {
      if (newCodeRowId != null) {
        await pool.query('DELETE FROM sms_verification_codes WHERE id = $1', [newCodeRowId])
      }
      jsonPublicAuth(res, 503, {
        message: smsResult.publicMessage ?? SMS_PUBLIC_DELAY_MESSAGE,
        retryAfterSec: smsResult.retryAfterSec,
      })
      return
    }

    await recordPhoneSms10MinSend(phoneNorm)

    const quotaClient = await pool.connect()
    try {
      await quotaClient.query('BEGIN')
      await applyUserSmsRequestAfterSend(quotaClient, user.id, quota, userGa)
      await quotaClient.query('COMMIT')
    } catch (eq) {
      try {
        await quotaClient.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      console.error('[sms-auth] password_reset quota after SMS failed', eq)
    } finally {
      quotaClient.release()
    }

    logSmsEvent('password_reset_code_issued', {
      purpose: SMS_PURPOSE_PASSWORD_RESET,
      userId: user.id,
    })

    const payload = { ok: true, message: '인증번호가 발송되었습니다.' }
    if (showDebugCode) {
      payload.debugCode = code
    }
    res.json(payload)
  })

  apiRouter.post('/auth/reset-password-by-sms', async (req, res) => {
    const client = await pool.connect()
    const clientIp = getClientIp(req)
    try {
      const usernameNorm = String(req.body?.username ?? '').trim()
      const phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const codeRaw = String(req.body?.code ?? '').trim()
      const newPassword = req.body?.newPassword ?? req.body?.new_password

      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        jsonPublicAuth(res, 400)
        return
      }
      if (!usernameNorm) {
        jsonPublicAuth(res, 400)
        return
      }
      if (!/^\d{6}$/.test(codeRaw)) {
        jsonPublicAuth(res, 400)
        return
      }

      const lock = await assertNotVerifyLocked(SMS_PURPOSE_PASSWORD_RESET, phoneNorm, usernameNorm, clientIp)
      if (!lock.ok) {
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: clientIp,
          status: 'verify_locked',
          purpose: SMS_PURPOSE_PASSWORD_RESET,
        })
        jsonPublicAuth(res, 429, { retryAfterSec: lock.retryAfterSec })
        return
      }

      const pwdMsg = validateCredentials(usernameNorm, newPassword)
      if (pwdMsg) {
        jsonPublicAuth(res, 400)
        return
      }

      const user = await loadActiveUserByUsername(pool, usernameNorm)
      const okUser =
        user &&
        String(user.role ?? '').toUpperCase() === 'USER' &&
        String(user.status ?? '').toLowerCase() === 'active' &&
        normalizeKrMobile(user.phone_number) === phoneNorm

      if (!okUser) {
        await recordVerifyFailure(SMS_PURPOSE_PASSWORD_RESET, phoneNorm, usernameNorm, clientIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: clientIp,
          status: 'user_mismatch',
          purpose: SMS_PURPOSE_PASSWORD_RESET,
        })
        jsonPublicAuth(res, 400)
        return
      }

      const userGa = parseGaId(user.ga_id)
      if (userGa == null) {
        jsonPublicAuth(res, 500)
        return
      }

      const acctLockPre = assertNotSmsAccountLocked(user)
      if (!acctLockPre.ok) {
        jsonPublicAuth(res, 429, {
          retryAfterSec: acctLockPre.retryAfterSec,
          retryAfterMin: acctLockPre.retryAfterMin,
        })
        return
      }

      const auditIp = clientIp
      const auditUa = getClientUserAgent(req)
      const passwordHash = await bcrypt.hash(String(newPassword), 10)

      await client.query('BEGIN')
      const consumed = await consumeSmsVerificationCode(client, {
        userId: user.id,
        phoneNumber: phoneNorm,
        code: codeRaw,
        purpose: SMS_PURPOSE_PASSWORD_RESET,
        username: usernameNorm,
      })
      if (consumed.rowCount === 0) {
        await client.query('ROLLBACK')
        await incrementLatestSmsCodeFailures(pool, {
          userId: user.id,
          phoneNumber: phoneNorm,
          purpose: SMS_PURPOSE_PASSWORD_RESET,
        })
        await recordUserSmsVerificationFailure(pool, user.id, userGa)
        await insertSmsVerificationLog(pool, {
          userId: user.id,
          phoneNumber: phoneNorm,
          purpose: SMS_PURPOSE_PASSWORD_RESET,
          success: false,
          ip: auditIp,
          userAgent: auditUa,
        })
        await recordVerifyFailure(SMS_PURPOSE_PASSWORD_RESET, phoneNorm, usernameNorm, clientIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: clientIp,
          status: 'code_invalid_or_used',
          purpose: SMS_PURPOSE_PASSWORD_RESET,
        })
        jsonPublicAuth(res, 400)
        return
      }

      await client.query(
        `UPDATE users SET password_hash = $1 WHERE id = $2 AND ga_id = $3 AND is_deleted = false`,
        [passwordHash, user.id, userGa],
      )
      await clearUserSmsRequestQuota(client, user.id, userGa)
      await client.query('COMMIT')

      void insertSmsVerificationLog(pool, {
        userId: user.id,
        phoneNumber: phoneNorm,
        purpose: SMS_PURPOSE_PASSWORD_RESET,
        success: true,
        ip: auditIp,
        userAgent: auditUa,
      }).catch((err) => console.error('[sms-auth] audit log failed', err))

      await clearVerifyFailures(SMS_PURPOSE_PASSWORD_RESET, phoneNorm, usernameNorm, clientIp)
      logSmsEvent('password_reset_complete', { userId: user.id })
      res.json({ ok: true, message: '비밀번호가 변경되었습니다.' })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      console.error('[sms-auth] reset-password-by-sms', e)
      jsonPublicAuth(res, 500)
    } finally {
      client.release()
    }
  })

  apiRouter.post('/account/request-reset-account-code', requireAuth, requireEndUser, async (req, res) => {
    const acctClientIp = getClientIp(req)
    const client = await pool.connect()
    let phoneNorm = ''
    let code = ''
    let newCodeRowId
    let quota
    let userId = ''
    let actorGaId
    try {
      const ipLimit = await assertSmsRequestIpLimit(req)
      if (!ipLimit.ok) {
        res.status(429).json({ message: PUBLIC_AUTH_MSG, retryAfterSec: ipLimit.retryAfterSec })
        return
      }

      userId = String(req.user?.id ?? '').trim()
      actorGaId = parseGaId(req.user?.gaId)
      if (actorGaId == null) {
        res.status(400).json({ message: '세션 GA 정보가 올바르지 않습니다.' })
        return
      }
      phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        res.status(400).json({ message: phoneErr })
        return
      }

      const burstAcct = await assertPhoneSms10MinLimit(phoneNorm)
      if (!burstAcct.ok) {
        res.status(429).json({ message: PUBLIC_AUTH_MSG, retryAfterSec: burstAcct.retryAfterSec })
        return
      }

      await client.query('BEGIN')
      const uR = await client.query(
        `
        SELECT
          id, phone_number, role, status, is_deleted,
          last_sms_requested_at, sms_request_count, sms_request_window_start,
          sms_blocked_until
        FROM users
        WHERE id = $1 AND ga_id = $2 AND is_deleted = false
        FOR UPDATE
        `,
        [userId, actorGaId],
      )
      const u = uR.rows[0]
      if (!u || String(u.role ?? '').toUpperCase() !== 'USER') {
        await client.query('ROLLBACK')
        res.status(403).json({ message: '처리할 수 없는 계정입니다.' })
        return
      }
      if (String(u.status ?? '').toLowerCase() !== 'active') {
        await client.query('ROLLBACK')
        res.status(403).json({ message: '접근이 제한된 계정입니다.' })
        return
      }
      if (normalizeKrMobile(u.phone_number) !== phoneNorm) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '계정에 등록된 휴대폰 번호와 일치하지 않습니다.' })
        return
      }

      const acctLockReq = assertNotSmsAccountLocked(u)
      if (!acctLockReq.ok) {
        await client.query('ROLLBACK')
        res.status(429).json({
          message: acctLockReq.message,
          retryAfterSec: acctLockReq.retryAfterSec,
          retryAfterMin: acctLockReq.retryAfterMin,
        })
        return
      }

      quota = evaluateUserSmsRequestQuota(u)
      if (!quota.ok) {
        await client.query('ROLLBACK')
        res.status(429).json({ message: quota.message, retryAfterSec: quota.retryAfterSec })
        return
      }

      await client.query(
        `
        UPDATE sms_verification_codes SET used = true
        WHERE purpose = $1 AND user_id = $2 AND used = false
        `,
        [SMS_PURPOSE_ACCOUNT_RESET, userId],
      )

      code = String(randomInt(100_000, 1_000_000))
      const insAcct = await client.query(
        `
        INSERT INTO sms_verification_codes
          (purpose, user_id, username, phone_number, code, expires_at)
        VALUES ($1, $2, NULL, $3, $4, NOW() + INTERVAL '5 minutes')
        RETURNING id
        `,
        [SMS_PURPOSE_ACCOUNT_RESET, userId, phoneNorm, code],
      )
      newCodeRowId = insAcct.rows[0]?.id

      await client.query('COMMIT')
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
      return
    } finally {
      client.release()
    }

    const smsResultAcct = await sendVerificationCode({
      phoneNumber: phoneNorm,
      code,
      purpose: SMS_PURPOSE_ACCOUNT_RESET,
      clientIp: acctClientIp,
    })

    if (!smsResultAcct?.success) {
      if (newCodeRowId != null) {
        await pool.query('DELETE FROM sms_verification_codes WHERE id = $1', [newCodeRowId])
      }
      res.status(503).json({
        message: smsResultAcct.publicMessage ?? SMS_PUBLIC_DELAY_MESSAGE,
        retryAfterSec: smsResultAcct.retryAfterSec,
      })
      return
    }

    await recordPhoneSms10MinSend(phoneNorm)

    const quotaClientAcct = await pool.connect()
    try {
      await quotaClientAcct.query('BEGIN')
      await applyUserSmsRequestAfterSend(quotaClientAcct, userId, quota, actorGaId)
      await quotaClientAcct.query('COMMIT')
    } catch (eq) {
      try {
        await quotaClientAcct.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      console.error('[sms-auth] account_reset quota after SMS failed', eq)
    } finally {
      quotaClientAcct.release()
    }

    logSmsEvent('account_reset_code_issued', {
      purpose: SMS_PURPOSE_ACCOUNT_RESET,
      userId,
    })

    const payload = { ok: true, message: '인증번호가 발송되었습니다.' }
    if (showDebugCode) {
      payload.debugCode = code
    }
    res.json(payload)
  })

  apiRouter.post('/account/reset-account-by-sms', requireAuth, requireEndUser, async (req, res) => {
    const client = await pool.connect()
    const acctResetIp = getClientIp(req)
    try {
      const userId = String(req.user?.id ?? '').trim()
      const actorGaId = parseGaId(req.user?.gaId)
      if (actorGaId == null) {
        res.status(400).json({ message: '세션 GA 정보가 올바르지 않습니다.' })
        return
      }
      const phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const codeRaw = String(req.body?.code ?? '').trim()
      const confirmReset = req.body?.confirmReset === true

      if (!confirmReset) {
        res.status(400).json({ message: '데이터 삭제 및 계정 초기화에 동의해야 진행할 수 있습니다.' })
        return
      }

      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        res.status(400).json({ message: phoneErr })
        return
      }
      if (!/^\d{6}$/.test(codeRaw)) {
        res.status(400).json({ message: '인증번호 6자리를 입력해 주세요.' })
        return
      }

      const lock = await assertNotVerifyLocked(SMS_PURPOSE_ACCOUNT_RESET, phoneNorm, userId, acctResetIp)
      if (!lock.ok) {
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: acctResetIp,
          status: 'verify_locked',
          purpose: SMS_PURPOSE_ACCOUNT_RESET,
        })
        res.status(429).json({ message: lock.message, retryAfterSec: lock.retryAfterSec })
        return
      }

      const uR = await systemQuery(
        pool,
        `
        SELECT id, username, phone_number, role, status, sms_blocked_until
        FROM users
        WHERE id = $1 AND ga_id = $2 AND is_deleted = false
        `,
        [userId, actorGaId],
      )
      const u = uR.rows[0]
      if (!u || String(u.role ?? '').toUpperCase() !== 'USER') {
        res.status(403).json({ message: '처리할 수 없는 계정입니다.' })
        return
      }
      if (String(u.status ?? '').toLowerCase() !== 'active') {
        res.status(403).json({ message: '접근이 제한된 계정입니다.' })
        return
      }
      if (normalizeKrMobile(u.phone_number) !== phoneNorm) {
        await recordVerifyFailure(SMS_PURPOSE_ACCOUNT_RESET, phoneNorm, userId, acctResetIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: acctResetIp,
          status: 'phone_mismatch',
          purpose: SMS_PURPOSE_ACCOUNT_RESET,
        })
        res.status(400).json({ message: '계정에 등록된 휴대폰 번호와 일치하지 않습니다.' })
        return
      }

      const acctLockPre = assertNotSmsAccountLocked(u)
      if (!acctLockPre.ok) {
        res.status(429).json({
          message: acctLockPre.message,
          retryAfterSec: acctLockPre.retryAfterSec,
          retryAfterMin: acctLockPre.retryAfterMin,
        })
        return
      }

      const newUsername = `__reset_${userId.replace(/-/g, '')}`
      const randomPwdHash = await bcrypt.hash(randomUUID(), 10)
      const auditIp = acctResetIp
      const auditUa = getClientUserAgent(req)

      await client.query('BEGIN')
      const consumed = await consumeSmsVerificationCode(client, {
        userId,
        phoneNumber: phoneNorm,
        code: codeRaw,
        purpose: SMS_PURPOSE_ACCOUNT_RESET,
        username: null,
      })
      if (consumed.rowCount === 0) {
        await client.query('ROLLBACK')
        await incrementLatestSmsCodeFailures(pool, {
          userId,
          phoneNumber: phoneNorm,
          purpose: SMS_PURPOSE_ACCOUNT_RESET,
        })
        await recordUserSmsVerificationFailure(pool, userId, actorGaId)
        await insertSmsVerificationLog(pool, {
          userId,
          phoneNumber: phoneNorm,
          purpose: SMS_PURPOSE_ACCOUNT_RESET,
          success: false,
          ip: auditIp,
          userAgent: auditUa,
        })
        await recordVerifyFailure(SMS_PURPOSE_ACCOUNT_RESET, phoneNorm, userId, acctResetIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: acctResetIp,
          status: 'code_invalid_or_used',
          purpose: SMS_PURPOSE_ACCOUNT_RESET,
        })
        res.status(400).json({ message: '인증번호가 올바르지 않거나 이미 사용되었습니다.' })
        return
      }

      await runAccountResetDataOnClient(client, {
        userId,
        gaId: actorGaId,
        newUsername,
        passwordHash: randomPwdHash,
      })
      await client.query('COMMIT')

      void insertSmsVerificationLog(pool, {
        userId,
        phoneNumber: phoneNorm,
        purpose: SMS_PURPOSE_ACCOUNT_RESET,
        success: true,
        ip: auditIp,
        userAgent: auditUa,
      }).catch((err) => console.error('[sms-auth] audit log failed', err))

      await clearVerifyFailures(SMS_PURPOSE_ACCOUNT_RESET, phoneNorm, userId, acctResetIp)
      logSmsEvent('account_reset_complete', { userId })
      res.json({
        ok: true,
        message:
          '계정이 초기화되었습니다. 고객·신청 관련 데이터가 삭제되었으며, 이 계정으로는 더 이상 로그인할 수 없습니다.',
      })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })
}
