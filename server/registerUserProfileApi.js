import { randomInt } from 'node:crypto'
import { parseGaId } from './lib/parseGaId.js'
import { issueSignupPhoneProof, issueRegistrationSignupPhoneProof, issuePhoneChangeProof, verifyPhoneChangeProof } from './lib/signupPhoneProof.js'
import {
  evaluateTenantRegistrationCodeForSignup,
  normalizeIndustryCodeParam,
  normalizeTenantRegistrationCodeRaw,
} from './lib/tenantRegistrationCodes.js'
import { systemQuery } from './utils/dbSafeQuery.js'
import { sendVerificationCode } from './services/smsService.js'
import { consumeAnonymousSmsVerificationCode, consumeSmsVerificationCode } from './services/consumeSmsVerificationCode.js'
import {
  assertNotVerifyLocked,
  recordVerifyFailure,
  clearVerifyFailures,
  assertCanRequestSmsCode,
} from './services/smsRateLimit.js'
import { assertPhoneSms10MinLimit, recordPhoneSms10MinSend } from './services/smsPhoneWindowLimit.js'
import { assertSmsRequestIpLimit, getClientIp, getClientUserAgent } from './services/smsRequestIpLimit.js'
import { assertNotSmsAccountLocked } from './services/smsAccountLock.js'
import { insertSmsVerificationLog } from './services/smsVerificationAudit.js'
import { applyUserSmsRequestAfterSend, evaluateUserSmsRequestQuota } from './services/smsUserDbRate.js'
import { normalizeKrMobile, validateKrMobileDigits } from './lib/phoneNormalize.js'
import { logSmsVerifyFailure } from './services/smsStructuredLog.js'
import { SMS_PUBLIC_DELAY_MESSAGE } from './services/smsPublicMessages.js'
import { buildSubscriptionResponseForUser } from './subscription/applyToResponseUser.js'
import { exposeSmsDebugCode } from './lib/smsDebugExposure.js'

const SMS_PURPOSE_SIGNUP = 'SIGNUP'
const SMS_PURPOSE_PHONE_CHANGE = 'PHONE_CHANGE'

/** USER 역할·숫자만 동일(포맷 무시) — 회원가입/가입 SMS 플로우용 */
async function isUserSignupPhoneDuplicate(pool, phoneDigits) {
  const r = await systemQuery(
    pool,
    `
    SELECT 1
    FROM users
    WHERE is_deleted = false
      AND role = 'USER'
      AND regexp_replace(COALESCE(phone_number, ''), '[^0-9]', '', 'g') = $1
    LIMIT 1
    `,
    [phoneDigits],
  )
  return r.rowCount > 0
}

async function isPhoneUsedByActiveUser(pool, phoneDigits, excludeUserId = '') {
  const ex = String(excludeUserId ?? '').trim()
  const r = await systemQuery(
    pool,
    `
    SELECT 1 FROM users
    WHERE phone_number = $1 AND is_deleted = false
      AND ($2 = '' OR id <> $2)
    LIMIT 1
    `,
    [phoneDigits, ex],
  )
  return r.rowCount > 0
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {string} ctx.JWT_SECRET
 * @param {Function} ctx.handleDbError
 * @param {Function} ctx.requireAuth
 * @param {boolean} ctx.RUNNING_IN_PRODUCTION
 * @param {Function} ctx.normalizeInviteCode (raw) => string
 */
export function registerUserProfileApi(apiRouter, ctx) {
  const { pool, JWT_SECRET, handleDbError, requireAuth, RUNNING_IN_PRODUCTION, normalizeInviteCode } = ctx

  const showDebugCode = exposeSmsDebugCode(RUNNING_IN_PRODUCTION)

  function requireProfileUser(req, res, next) {
    if (req.user?.role !== 'USER') {
      res.status(403).json({ message: '프로필은 일반 설계사(USER) 계정에서만 이용할 수 있습니다.' })
      return
    }
    next()
  }

  /** 회원가입 화면: GA 코드 존재·활성 여부 및 회사명 조회(비로그인 공개) */
  apiRouter.get('/ga/validate', async (req, res) => {
    try {
      const inviteNorm = normalizeInviteCode(String(req.query?.code ?? ''))
      if (!inviteNorm) {
        res.json({ success: false })
        return
      }
      const gaRow = await systemQuery(
        pool,
        `SELECT name, status FROM ga_companies WHERE code = $1 AND is_deleted = false`,
        [inviteNorm],
      )
      if (gaRow.rows.length === 0) {
        res.json({ success: false })
        return
      }
      const row = gaRow.rows[0]
      if (String(row.status ?? '').toLowerCase() !== 'active') {
        res.json({ success: false })
        return
      }
      const gaName = String(row.name ?? '').trim()
      res.json({ success: true, gaName: gaName || inviteNorm })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/auth/validate-tenant-registration-code', async (req, res) => {
    try {
      const industryNorm = normalizeIndustryCodeParam(req.body?.industry_code ?? req.body?.industryCode ?? '')
      const regNorm = normalizeTenantRegistrationCodeRaw(
        req.body?.registration_code ?? req.body?.registrationCode ?? req.body?.tenant_registration_code ?? '',
      )
      const ev = await evaluateTenantRegistrationCodeForSignup(pool, {
        industryCodeNorm: industryNorm,
        registrationCodeNorm: regNorm,
      })
      if (!ev.ok) {
        res.status(ev.status).json({ ok: false, message: ev.message })
        return
      }
      res.json({
        ok: true,
        tenantName: String(ev.row.tenant_name ?? '').trim(),
        industryCode: industryNorm,
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/auth/send-signup-phone-code', async (req, res) => {
    const clientIp = getClientIp(req)
    let phoneNorm = ''
    let code = ''
    let newCodeRowId
    const client = await pool.connect()
    try {
      const ipLimit = await assertSmsRequestIpLimit(req)
      if (!ipLimit.ok) {
        res.status(429).json({ message: '요청이 너무 많습니다.', retryAfterSec: ipLimit.retryAfterSec })
        return
      }

      const inviteRaw = req.body?.invite_code ?? req.body?.inviteCode
      const industryNorm = normalizeIndustryCodeParam(req.body?.industry_code ?? req.body?.industryCode ?? '')
      const regNorm = normalizeTenantRegistrationCodeRaw(
        req.body?.registration_code ?? req.body?.registrationCode ?? req.body?.tenant_registration_code ?? '',
      )
      const useTenantRegistration = industryNorm.length > 0 && regNorm.length >= 3

      if (!useTenantRegistration) {
        const inviteNorm = normalizeInviteCode(inviteRaw ?? '')
        if (!inviteNorm) {
          res.status(400).json({ message: 'GA 코드(초대 코드)를 입력해 주세요.' })
          return
        }
      }

      phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        res.status(400).json({ message: phoneErr })
        return
      }

      if (useTenantRegistration) {
        const ev = await evaluateTenantRegistrationCodeForSignup(pool, {
          industryCodeNorm: industryNorm,
          registrationCodeNorm: regNorm,
        })
        if (!ev.ok) {
          res.status(ev.status).json({ message: ev.message })
          return
        }
      } else {
        const inviteNorm = normalizeInviteCode(inviteRaw ?? '')
        const gaCheck = await systemQuery(
          pool,
          `SELECT id, status FROM ga_companies WHERE code = $1 AND is_deleted = false`,
          [inviteNorm],
        )
        if (gaCheck.rows.length === 0) {
          res.status(400).json({ message: '유효하지 않은 코드입니다' })
          return
        }
        if (String(gaCheck.rows[0].status ?? '').toLowerCase() !== 'active') {
          res.status(400).json({ message: '가입할 수 없는 GA입니다' })
          return
        }
      }

      if (await isUserSignupPhoneDuplicate(pool, phoneNorm)) {
        res.status(409).json({ message: '이미 가입된 휴대폰 번호입니다.' })
        return
      }

      const gap = await assertCanRequestSmsCode(SMS_PURPOSE_SIGNUP, phoneNorm)
      if (!gap.ok) {
        res.status(429).json({ message: gap.message, retryAfterSec: gap.retryAfterSec })
        return
      }

      const burst = await assertPhoneSms10MinLimit(phoneNorm)
      if (!burst.ok) {
        res.status(429).json({ message: '요청이 너무 많습니다.', retryAfterSec: burst.retryAfterSec })
        return
      }

      await client.query('BEGIN')
      await client.query(
        `
        UPDATE sms_verification_codes
        SET used = TRUE, verified_at = NOW()
        WHERE purpose = $1 AND phone_number = $2 AND user_id IS NULL AND used = FALSE
        `,
        [SMS_PURPOSE_SIGNUP, phoneNorm],
      )

      code = String(randomInt(100_000, 1_000_000))
      const ins = await client.query(
        `
        INSERT INTO sms_verification_codes
          (purpose, user_id, username, phone_number, code, expires_at)
        VALUES ($1, NULL, NULL, $2, $3, NOW() + INTERVAL '3 minutes')
        RETURNING id
        `,
        [SMS_PURPOSE_SIGNUP, phoneNorm, code],
      )
      newCodeRowId = ins.rows[0]?.id
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

    const smsResult = await sendVerificationCode({
      phoneNumber: phoneNorm,
      code,
      purpose: SMS_PURPOSE_SIGNUP,
      clientIp,
    })
    if (!smsResult?.success) {
      if (newCodeRowId != null) {
        await pool.query('DELETE FROM sms_verification_codes WHERE id = $1', [newCodeRowId])
      }
      res.status(503).json({
        message: smsResult.publicMessage ?? SMS_PUBLIC_DELAY_MESSAGE,
        retryAfterSec: smsResult.retryAfterSec,
      })
      return
    }

    await recordPhoneSms10MinSend(phoneNorm)

    const payload = { ok: true, message: '인증번호가 발송되었습니다.' }
    if (showDebugCode) {
      payload.debugCode = code
    }
    res.json(payload)
  })

  const verifySignupPhoneCodeLegacy = async (req, res) => {
    const phoneRaw = String(req.body?.phone ?? req.body?.phoneNumber ?? req.body?.phone_number ?? '').trim()
    const codeRaw = String(req.body?.code ?? '').trim()
    if (!phoneRaw || !codeRaw) {
      return res.status(400).json({
        success: false,
        message: '휴대폰번호 또는 인증번호 누락',
      })
    }

    const normalizedPhone = phoneRaw.replace(/[^0-9]/g, '')
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: '휴대폰번호 또는 인증번호 누락',
      })
    }

    const savedRes = await systemQuery(
      pool,
      `
      SELECT id, code, expires_at
      FROM sms_verification_codes
      WHERE purpose = $1
        AND phone_number = $2
        AND user_id IS NULL
        AND used = FALSE
      ORDER BY id DESC
      LIMIT 1
      `,
      [SMS_PURPOSE_SIGNUP, normalizedPhone],
    )
    const saved = savedRes.rows[0] ?? null

    console.log('PHONE:', normalizedPhone)
    console.log('INPUT CODE:', codeRaw)
    console.log('SAVED CODE:', saved?.code)

    if (!saved) {
      return res.status(400).json({
        success: false,
        message: '인증 요청이 존재하지 않습니다.',
      })
    }

    if (String(saved.code) !== String(codeRaw)) {
      return res.status(400).json({
        success: false,
        message: '인증번호가 일치하지 않습니다.',
      })
    }

    const expireAtMs = saved.expires_at ? new Date(saved.expires_at).getTime() : 0
    if (!Number.isFinite(expireAtMs) || expireAtMs < Date.now()) {
      return res.status(400).json({
        success: false,
        message: '인증번호가 만료되었습니다.',
      })
    }

    await pool.query(
      `
      UPDATE sms_verification_codes
      SET used = TRUE, verified_at = NOW()
      WHERE id = $1
      `,
      [saved.id],
    )

    return res.json({
      success: true,
      message: '인증 완료',
    })
  }

  apiRouter.post('/signup-phone-code', async (req, res) => {
    try {
      await verifySignupPhoneCodeLegacy(req, res)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/auth/signup-phone-code', async (req, res) => {
    try {
      await verifySignupPhoneCodeLegacy(req, res)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/auth/verify-signup-phone-code', async (req, res) => {
    const clientIp = getClientIp(req)
    const clientUa = getClientUserAgent(req)
    const tx = await pool.connect()
    try {
      const inviteRaw = req.body?.invite_code ?? req.body?.inviteCode
      const industryNorm = normalizeIndustryCodeParam(req.body?.industry_code ?? req.body?.industryCode ?? '')
      const regNorm = normalizeTenantRegistrationCodeRaw(
        req.body?.registration_code ?? req.body?.registrationCode ?? req.body?.tenant_registration_code ?? '',
      )
      const useTenantRegistration = industryNorm.length > 0 && regNorm.length >= 3

      let inviteNorm = ''
      /** @type {string} 소진율 리밋/락 키 세그먼트 */
      let lockScope = ''
      /** @type {number | null} */
      let gaId = null
      /** @type {number | null} */
      let tenantPkForProof = null

      if (useTenantRegistration) {
        lockScope = `${industryNorm}:${regNorm}`
      } else {
        inviteNorm = normalizeInviteCode(inviteRaw ?? '')
        if (!inviteNorm) {
          res.status(400).json({ message: 'GA 코드(초대 코드)를 입력해 주세요.' })
          return
        }
        lockScope = inviteNorm
      }

      const phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        res.status(400).json({ message: phoneErr })
        return
      }
      const codeRaw = String(req.body?.code ?? '').trim()
      if (!/^\d{6}$/.test(codeRaw)) {
        res.status(400).json({ message: '인증번호 6자리를 입력해 주세요.' })
        return
      }

      const lock = await assertNotVerifyLocked(SMS_PURPOSE_SIGNUP, phoneNorm, lockScope, clientIp)
      if (!lock.ok) {
        res.status(429).json({ message: lock.message, retryAfterSec: lock.retryAfterSec })
        return
      }

      if (useTenantRegistration) {
        const ev = await evaluateTenantRegistrationCodeForSignup(pool, {
          industryCodeNorm: industryNorm,
          registrationCodeNorm: regNorm,
        })
        if (!ev.ok) {
          res.status(ev.status).json({ message: ev.message })
          return
        }
        gaId = ev.gaId
        tenantPkForProof = ev.tenantDbId
        const isGovSignup =
          String(industryNorm ?? '')
            .trim()
            .toLowerCase() === 'government'
        if (!isGovSignup) {
          const dtCheck = String(ev.row.default_membership_type ?? 'agent').trim().toLowerCase()
          const daCheck = String(ev.row.default_customer_access ?? 'own').trim().toLowerCase()
          const drCheck = String(ev.row.default_role ?? 'user').trim().toLowerCase()
          if (dtCheck !== 'agent' || daCheck !== 'own' || drCheck !== 'user') {
            res.status(400).json({ message: '이 경로에서는 일반 agent(본인 고객) 가입만 허용됩니다.' })
            return
          }
        }
      } else {
        const gaCheck = await systemQuery(
          pool,
          `SELECT id, status FROM ga_companies WHERE code = $1 AND is_deleted = false`,
          [inviteNorm],
        )
        if (gaCheck.rows.length === 0) {
          res.status(400).json({ message: '유효하지 않은 코드입니다' })
          return
        }
        if (String(gaCheck.rows[0].status ?? '').toLowerCase() !== 'active') {
          res.status(400).json({ message: '가입할 수 없는 GA입니다' })
          return
        }
        gaId = parseGaId(gaCheck.rows[0].id)
        if (gaId == null) {
          res.status(400).json({ message: '유효하지 않은 코드입니다' })
          return
        }
      }

      if (await isUserSignupPhoneDuplicate(pool, phoneNorm)) {
        res.status(409).json({ message: '이미 가입된 휴대폰 번호입니다.' })
        return
      }

      await tx.query('BEGIN')
      const consumed = await consumeAnonymousSmsVerificationCode(tx, {
        phoneNumber: phoneNorm,
        code: codeRaw,
        purpose: SMS_PURPOSE_SIGNUP,
      })
      if (consumed.rowCount === 0) {
        await tx.query('ROLLBACK')
        await recordVerifyFailure(SMS_PURPOSE_SIGNUP, phoneNorm, lockScope, clientIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: clientIp,
          status: 'code_invalid_or_used',
          purpose: SMS_PURPOSE_SIGNUP,
        })
        void insertSmsVerificationLog(pool, {
          userId: null,
          phoneNumber: phoneNorm,
          purpose: SMS_PURPOSE_SIGNUP,
          success: false,
          ip: clientIp,
          userAgent: clientUa,
        })
        res.status(400).json({ message: '인증번호가 올바르지 않거나 만료되었습니다.' })
        return
      }

      const consumedRowId = consumed.rows[0]?.id
      if (consumedRowId != null) {
        await tx.query('DELETE FROM sms_verification_codes WHERE id = $1', [consumedRowId])
      }
      await tx.query('COMMIT')

      void insertSmsVerificationLog(pool, {
        userId: null,
        phoneNumber: phoneNorm,
        purpose: SMS_PURPOSE_SIGNUP,
        success: true,
        ip: clientIp,
        userAgent: clientUa,
      }).catch(() => {})

      await clearVerifyFailures(SMS_PURPOSE_SIGNUP, phoneNorm, lockScope, clientIp)

      const signup_phone_proof = useTenantRegistration
        ? issueRegistrationSignupPhoneProof({
            JWT_SECRET,
            phoneDigits: phoneNorm,
            industryCodeNormalized: industryNorm,
            registrationCodeNormalized: regNorm,
            gaId: gaId ?? 0,
            tenantId: tenantPkForProof ?? 0,
          })
        : issueSignupPhoneProof({
            JWT_SECRET,
            phoneDigits: phoneNorm,
            inviteCodeNormalized: inviteNorm,
            gaId: gaId ?? 0,
          })

      res.json({
        ok: true,
        message: '휴대폰 인증이 완료되었습니다.',
        signup_phone_proof,
      })
    } catch (e) {
      try {
        await tx.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      tx.release()
    }
  })

  apiRouter.get('/me', requireAuth, requireProfileUser, async (req, res) => {
    try {
      const uid = String(req.user?.id ?? '').trim()
      const r = await systemQuery(
        pool,
        `
        SELECT id, username, display_name, phone_number, role, ga_id, status, team_id,
               subscription_plan, subscription_started_at, subscription_expires_at
        FROM users
        WHERE id = $1 AND is_deleted = false
        `,
        [uid],
      )
      if (r.rows.length === 0) {
        res.status(404).json({ message: '사용자 정보를 찾을 수 없습니다.' })
        return
      }
      const row = r.rows[0]
      const subscription = await buildSubscriptionResponseForUser({
        role: String(row.role ?? ''),
        subscription_plan: row.subscription_plan ?? null,
        subscription_started_at: row.subscription_started_at ?? null,
        subscription_expires_at: row.subscription_expires_at ?? null,
      })
      res.json({
        id: String(row.id),
        username: String(row.username ?? ''),
        display_name: String(row.display_name ?? '').trim(),
        phone_number: normalizeKrMobile(row.phone_number ?? ''),
        role: String(row.role ?? ''),
        ga_id: row.ga_id,
        status: String(row.status ?? 'active').toLowerCase(),
        team_id: row.team_id != null ? String(row.team_id) : null,
        subscription,
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/me', requireAuth, requireProfileUser, async (req, res) => {
    const client = await pool.connect()
    try {
      const uid = String(req.user?.id ?? '').trim()
      const gaId = parseGaId(req.user?.gaId)
      if (!uid) {
        res.status(400).json({ message: '잘못된 요청입니다.' })
        return
      }
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }

      const body = req.body ?? {}
      const hasName = Object.prototype.hasOwnProperty.call(body, 'display_name') || Object.prototype.hasOwnProperty.call(body, 'name')
      const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone_number') || Object.prototype.hasOwnProperty.call(body, 'phoneNumber')

      if (!hasName && !hasPhone) {
        res.status(400).json({ message: '수정할 항목이 없습니다.' })
        return
      }

      const uR = await systemQuery(
        pool,
        `SELECT id, phone_number, ga_id FROM users WHERE id = $1 AND is_deleted = false`,
        [uid],
      )
      if (uR.rows.length === 0) {
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
      const currentPhone = normalizeKrMobile(uR.rows[0].phone_number ?? '')
      const rowGa = parseGaId(uR.rows[0].ga_id)
      if (rowGa !== gaId) {
        res.status(403).json({ message: '권한이 없습니다.' })
        return
      }

      let newPhone = currentPhone
      if (hasPhone) {
        newPhone = normalizeKrMobile(body.phone_number ?? body.phoneNumber)
        const pErr = validateKrMobileDigits(newPhone)
        if (pErr) {
          res.status(400).json({ message: pErr })
          return
        }
      }

      const displayNameRaw =
        body.display_name ?? body.name ?? undefined
      const displayName =
        displayNameRaw !== undefined ? String(displayNameRaw ?? '').trim() : undefined
      if (displayName !== undefined && displayName === '') {
        res.status(400).json({ message: '이름을 입력해 주세요.' })
        return
      }

      let phoneToStore = currentPhone
      if (hasPhone) {
        if (newPhone === currentPhone) {
          phoneToStore = currentPhone
        } else {
          const proofRaw = String(body.phone_change_proof ?? '').trim()
          if (!proofRaw) {
            res.status(400).json({ message: '휴대폰 번호 변경을 위해 SMS 인증을 완료해 주세요.' })
            return
          }
          let proof
          try {
            proof = verifyPhoneChangeProof(proofRaw, JWT_SECRET)
          } catch {
            res.status(400).json({ message: '휴대폰 변경 인증이 만료되었거나 유효하지 않습니다.' })
            return
          }
          if (proof.userId !== uid || proof.newPhoneDigits !== newPhone) {
            res.status(400).json({ message: '인증 정보와 변경할 번호가 일치하지 않습니다.' })
            return
          }
          if (await isPhoneUsedByActiveUser(pool, newPhone, uid)) {
            res.status(409).json({ message: '다른 계정에서 사용 중인 휴대폰 번호입니다.' })
            return
          }
          phoneToStore = newPhone
        }
      }

      const sets = []
      const vals = []
      let n = 1
      if (displayName !== undefined) {
        sets.push(`display_name = $${n++}`)
        vals.push(displayName)
      }
      if (hasPhone && phoneToStore !== currentPhone) {
        sets.push(`phone_number = $${n++}`)
        vals.push(phoneToStore)
      }

      if (sets.length === 0) {
        const cur = await systemQuery(
          pool,
          `
          SELECT id, username, display_name, phone_number, role, ga_id, status, team_id
          FROM users WHERE id = $1 AND is_deleted = false
          `,
          [uid],
        )
        const row0 = cur.rows[0]
        res.json({
          id: String(row0.id),
          username: String(row0.username ?? ''),
          display_name: String(row0.display_name ?? '').trim(),
          phone_number: normalizeKrMobile(row0.phone_number ?? ''),
          role: String(row0.role ?? ''),
          ga_id: row0.ga_id,
          status: String(row0.status ?? 'active').toLowerCase(),
          team_id: row0.team_id != null ? String(row0.team_id) : null,
        })
        return
      }

      vals.push(uid, rowGa ?? gaId)
      const upd = await client.query(
        `
        UPDATE users SET ${sets.join(', ')}
        WHERE id = $${n} AND ga_id = $${n + 1} AND is_deleted = false
        RETURNING id, username, display_name, phone_number, role, ga_id, status, team_id
        `,
        vals,
      )

      if (upd.rowCount === 0) {
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
      const row = upd.rows[0]
      res.json({
        id: String(row.id),
        username: String(row.username ?? ''),
        display_name: String(row.display_name ?? '').trim(),
        phone_number: normalizeKrMobile(row.phone_number ?? ''),
        role: String(row.role ?? ''),
        ga_id: row.ga_id,
        status: String(row.status ?? 'active').toLowerCase(),
        team_id: row.team_id != null ? String(row.team_id) : null,
      })
    } catch (e) {
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.post('/me/send-phone-change-code', requireAuth, requireProfileUser, async (req, res) => {
    const clientIp = getClientIp(req)
    const client = await pool.connect()
    let phoneNorm = ''
    let code = ''
    let newCodeRowId
    let userId = ''
    let actorGaId
    let quota
    try {
      const ipLimit = await assertSmsRequestIpLimit(req)
      if (!ipLimit.ok) {
        res.status(429).json({ message: '요청이 너무 많습니다.', retryAfterSec: ipLimit.retryAfterSec })
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

      const burst = await assertPhoneSms10MinLimit(phoneNorm)
      if (!burst.ok) {
        res.status(429).json({ message: '요청이 너무 많습니다.', retryAfterSec: burst.retryAfterSec })
        return
      }

      await client.query('BEGIN')
      const uR = await client.query(
        `
        SELECT
          id, phone_number, role, status, is_deleted, ga_id,
          last_sms_requested_at, sms_request_count, sms_request_window_start, sms_blocked_until
        FROM users
        WHERE id = $1 AND ga_id = $2 AND is_deleted = false
        FOR UPDATE
        `,
        [userId, actorGaId],
      )
      const u = uR.rows[0]
      if (!u) {
        await client.query('ROLLBACK')
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
      const currentP = normalizeKrMobile(u.phone_number ?? '')
      if (currentP === phoneNorm) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '현재 번호와 동일합니다. 다른 번호를 입력해 주세요.' })
        return
      }
      if (await isPhoneUsedByActiveUser(pool, phoneNorm, userId)) {
        await client.query('ROLLBACK')
        res.status(409).json({ message: '다른 계정에서 사용 중인 휴대폰 번호입니다.' })
        return
      }

      const acctLock = assertNotSmsAccountLocked(u)
      if (!acctLock.ok) {
        await client.query('ROLLBACK')
        res.status(429).json({
          message: acctLock.message,
          retryAfterSec: acctLock.retryAfterSec,
          retryAfterMin: acctLock.retryAfterMin,
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
        UPDATE sms_verification_codes SET used = TRUE, verified_at = NOW()
        WHERE purpose = $1 AND user_id = $2 AND used = FALSE
        `,
        [SMS_PURPOSE_PHONE_CHANGE, userId],
      )

      code = String(randomInt(100_000, 1_000_000))
      const ins = await client.query(
        `
        INSERT INTO sms_verification_codes
          (purpose, user_id, username, phone_number, code, expires_at)
        VALUES ($1, $2, NULL, $3, $4, NOW() + INTERVAL '3 minutes')
        RETURNING id
        `,
        [SMS_PURPOSE_PHONE_CHANGE, userId, phoneNorm, code],
      )
      newCodeRowId = ins.rows[0]?.id
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

    const smsOk = await sendVerificationCode({
      phoneNumber: phoneNorm,
      code,
      purpose: SMS_PURPOSE_PHONE_CHANGE,
      clientIp,
    })
    if (!smsOk?.success) {
      if (newCodeRowId != null) {
        await pool.query('DELETE FROM sms_verification_codes WHERE id = $1', [newCodeRowId])
      }
      res.status(503).json({
        message: smsOk.publicMessage ?? SMS_PUBLIC_DELAY_MESSAGE,
        retryAfterSec: smsOk.retryAfterSec,
      })
      return
    }

    await recordPhoneSms10MinSend(phoneNorm)

    const quotaClient = await pool.connect()
    try {
      const gaRow = await systemQuery(pool, `SELECT ga_id FROM users WHERE id = $1`, [userId])
      const gIdForQuota = actorGaId ?? parseGaId(gaRow.rows[0]?.ga_id)
      if (gIdForQuota != null) {
        await quotaClient.query('BEGIN')
        await applyUserSmsRequestAfterSend(quotaClient, userId, quota, gIdForQuota)
        await quotaClient.query('COMMIT')
      }
    } catch (eq) {
      try {
        await quotaClient.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      console.error('[profile] phone-change quota after SMS failed', eq)
    } finally {
      quotaClient.release()
    }

    const payload = { ok: true, message: '인증번호가 발송되었습니다.' }
    if (showDebugCode) {
      payload.debugCode = code
    }
    res.json(payload)
  })

  apiRouter.post('/me/verify-phone-change-code', requireAuth, requireProfileUser, async (req, res) => {
    const clientIp = getClientIp(req)
    const clientUa = getClientUserAgent(req)
    const tx = await pool.connect()
    try {
      const userId = String(req.user?.id ?? '').trim()
      const actorGaId = parseGaId(req.user?.gaId)
      if (actorGaId == null) {
        res.status(400).json({ message: '세션 GA 정보가 올바르지 않습니다.' })
        return
      }

      const phoneNorm = normalizeKrMobile(req.body?.phoneNumber ?? req.body?.phone_number)
      const codeRaw = String(req.body?.code ?? '').trim()
      const phoneErr = validateKrMobileDigits(phoneNorm)
      if (phoneErr) {
        res.status(400).json({ message: phoneErr })
        return
      }
      if (!/^\d{6}$/.test(codeRaw)) {
        res.status(400).json({ message: '인증번호 6자리를 입력해 주세요.' })
        return
      }

      const lock = await assertNotVerifyLocked(SMS_PURPOSE_PHONE_CHANGE, phoneNorm, userId, clientIp)
      if (!lock.ok) {
        res.status(429).json({ message: lock.message, retryAfterSec: lock.retryAfterSec })
        return
      }

      const uR = await systemQuery(
        pool,
        `
        SELECT id, phone_number, ga_id, role, status, is_deleted, sms_blocked_until
        FROM users
        WHERE id = $1 AND is_deleted = false
        `,
        [userId],
      )
      const u = uR.rows[0]
      if (!u) {
        res.status(404).json({ message: '사용자를 찾을 수 없습니다.' })
        return
      }
      const uGa = parseGaId(u.ga_id)
      if (req.user.role !== 'SUPER_ADMIN' && uGa !== actorGaId) {
        res.status(403).json({ message: '권한이 없습니다.' })
        return
      }
      if (normalizeKrMobile(u.phone_number ?? '') === phoneNorm) {
        res.status(400).json({ message: '현재 번호와 동일합니다.' })
        return
      }
      if (await isPhoneUsedByActiveUser(pool, phoneNorm, userId)) {
        res.status(409).json({ message: '다른 계정에서 사용 중인 휴대폰 번호입니다.' })
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

      await tx.query('BEGIN')
      const consumed = await consumeSmsVerificationCode(tx, {
        userId,
        phoneNumber: phoneNorm,
        code: codeRaw,
        purpose: SMS_PURPOSE_PHONE_CHANGE,
        username: null,
      })
      if (consumed.rowCount === 0) {
        await tx.query('ROLLBACK')
        await recordVerifyFailure(SMS_PURPOSE_PHONE_CHANGE, phoneNorm, userId, clientIp)
        logSmsVerifyFailure({
          phone: phoneNorm,
          ip: clientIp,
          status: 'code_invalid_or_used',
          purpose: SMS_PURPOSE_PHONE_CHANGE,
        })
        res.status(400).json({ message: '인증번호가 올바르지 않거나 만료되었습니다.' })
        return
      }

      const consumedRowId = consumed.rows[0]?.id
      if (consumedRowId != null) {
        await tx.query('DELETE FROM sms_verification_codes WHERE id = $1', [consumedRowId])
      }
      await tx.query('COMMIT')

      void insertSmsVerificationLog(pool, {
        userId,
        phoneNumber: phoneNorm,
        purpose: SMS_PURPOSE_PHONE_CHANGE,
        success: true,
        ip: clientIp,
        userAgent: clientUa,
      }).catch(() => {})

      await clearVerifyFailures(SMS_PURPOSE_PHONE_CHANGE, phoneNorm, userId, clientIp)

      const phone_change_proof = issuePhoneChangeProof({
        JWT_SECRET,
        userId,
        newPhoneDigits: phoneNorm,
      })

      res.json({
        ok: true,
        message: '휴대폰 인증이 완료되었습니다. 변경 저장을 진행해 주세요.',
        phone_change_proof,
      })
    } catch (e) {
      try {
        await tx.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      tx.release()
    }
  })
}
