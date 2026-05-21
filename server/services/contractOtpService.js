import { createHash, randomInt, randomUUID } from 'node:crypto'
import { decryptContractTargetPhoneBlob } from '../lib/contractStoredPhone.js'
import {
  getContractOtpExpiresSeconds,
  getContractOtpMaxAttempts,
  getContractOtpMaxSendsPerSession,
  getContractOtpPepper,
  getContractOtpResendCooldownSeconds,
} from '../lib/contractOtpConfig.js'
import { normalizeKrMobile, validateKrMobileDigits } from '../lib/phoneNormalize.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'
import { sendContractSelfSmsOtp } from './contractSelfSmsSend.js'

const TERMINAL_SEND_SESSION = new Set(['expired', 'cancelled', 'completed'])

const DISALLOWED_BODY_PHONE_KEYS = new Set([
  'phone',
  'phoneNumber',
  'phone_number',
  'mobile',
  'tel',
  'mobilePhone',
])

export function assertNoPhoneFieldsInBody(body) {
  if (!body || typeof body !== 'object') {
    return null
  }
  for (const k of Object.keys(body)) {
    if (DISALLOWED_BODY_PHONE_KEYS.has(k)) {
      return '요청 본문에 전화번호 필드를 포함할 수 없습니다.'
    }
  }
  return null
}

function newIdentityId() {
  return `ids_${randomUUID()}`
}

function hashOtpCode(code, identitySessionId, sendSessionId) {
  const pepper = getContractOtpPepper()
  return createHash('sha256')
    .update(`${code}|${identitySessionId}|${sendSessionId}|${pepper}`, 'utf8')
    .digest('hex')
}

export function hashIpForContractOtp(clientIp, sendSessionId) {
  try {
    const pepper = getContractOtpPepper()
    return createHash('sha256')
      .update(`${String(clientIp ?? '')}|${sendSessionId}|${pepper}`, 'utf8')
      .digest('hex')
  } catch {
    return null
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} linkCode
 */
async function loadSendSessionWithCustomerPhone(client, linkCode) {
  const lc = String(linkCode ?? '').trim()
  if (!lc) {
    return null
  }
  const r = await client.query(
    `
    SELECT css.*, c.phone AS customer_phone_raw
    FROM contract_send_sessions css
    INNER JOIN customers c ON c.id = css.customer_id
    WHERE css.link_code = $1
    LIMIT 1
    `,
    [lc],
  )
  return r.rows[0] ?? null
}

function resolveTargetDigits(row) {
  const enc = String(row.target_phone_encrypted ?? '').trim()
  if (enc) {
    const d = decryptContractTargetPhoneBlob(enc)
    if (!d) {
      return { error: '지정 휴대폰 번호를 읽을 수 없습니다. 관리자에게 문의해 주세요.' }
    }
    const err = validateKrMobileDigits(d)
    if (err) {
      return { error: '발송 세션의 전화번호 형식이 올바르지 않습니다.' }
    }
    return { digits: d }
  }
  const d = normalizeKrMobile(row.customer_phone_raw)
  const err = validateKrMobileDigits(d)
  if (err) {
    return { error: '고객 휴대폰 번호가 없거나 형식이 올바르지 않습니다.' }
  }
  return { digits: d }
}

function displayMaskedPhone(row, digits) {
  const m = String(row.target_phone_masked ?? '').trim()
  if (m) {
    return m
  }
  return maskKrMobileForDisplay(digits)
}

function genSixDigitOtp() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ linkCode: string, clientIp: string, userAgent: string, body: unknown }} opts
 */
export async function contractOtpSend(pool, opts) {
  const linkCode = String(opts.linkCode ?? '').trim()
  const clientIp = String(opts.clientIp ?? '')
  const userAgent = String(opts.userAgent ?? '').slice(0, 512)
  const bodyErr = assertNoPhoneFieldsInBody(opts.body)
  if (bodyErr) {
    return { httpStatus: 400, payload: { success: false, message: bodyErr } }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const row = await loadSendSessionWithCustomerPhone(client, linkCode)
    if (!row) {
      await client.query('ROLLBACK')
      return { httpStatus: 404, payload: { success: false, message: '발송 세션을 찾을 수 없습니다.' } }
    }

    const st = String(row.status ?? '')
    if (TERMINAL_SEND_SESSION.has(st)) {
      await client.query('ROLLBACK')
      const msg =
        st === 'completed'
          ? '이미 완료된 발송 세션입니다.'
          : '더 이상 인증번호를 받을 수 없는 발송 세션입니다.'
      return { httpStatus: st === 'completed' ? 409 : 400, payload: { success: false, message: msg } }
    }

    const verifiedR = await client.query(
      `
      SELECT id FROM identity_verification_sessions
      WHERE send_session_id = $1 AND status = 'verified'
      LIMIT 1
      `,
      [row.id],
    )
    if (verifiedR.rowCount > 0) {
      await client.query('ROLLBACK')
      return {
        httpStatus: 409,
        payload: { success: false, message: '이미 지정 휴대폰 인증이 완료되었습니다.', code: 'already_verified' },
      }
    }

    const phoneRes = resolveTargetDigits(row)
    if (phoneRes.error) {
      await client.query('ROLLBACK')
      return { httpStatus: 400, payload: { success: false, message: phoneRes.error } }
    }
    const { digits } = phoneRes
    const maskedPhone = displayMaskedPhone(row, digits)

    const inflightR = await client.query(
      `
      SELECT *
      FROM identity_verification_sessions
      WHERE send_session_id = $1
        AND status IN ('pending', 'otp_sent', 'failed', 'expired')
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [row.id],
    )
    let identityRow = inflightR.rows[0] ?? null

    const now = new Date()
    const cooldownSec = getContractOtpResendCooldownSeconds()
    const maxSends = getContractOtpMaxSendsPerSession()

    if (identityRow) {
      if (identityRow.status === 'failed' && Number(identityRow.otp_attempt_count ?? 0) >= getContractOtpMaxAttempts()) {
        await client.query('ROLLBACK')
        return {
          httpStatus: 429,
          payload: { success: false, message: '인증 시도 횟수를 초과했습니다. 담당자에게 문의해 주세요.' },
        }
      }
      const sentAt = identityRow.otp_sent_at ? new Date(identityRow.otp_sent_at) : null
      if (sentAt && now.getTime() - sentAt.getTime() < cooldownSec * 1000) {
        await client.query('ROLLBACK')
        const retryAfterSec = Math.max(
          1,
          Math.ceil((cooldownSec * 1000 - (now.getTime() - sentAt.getTime())) / 1000),
        )
        return {
          httpStatus: 429,
          payload: {
            success: false,
            message: '잠시 후 다시 인증번호를 요청해 주세요.',
            retryAfterSec,
          },
        }
      }
      const sendCount = Number(identityRow.otp_send_count ?? 0)
      if (sendCount >= maxSends) {
        await client.query('ROLLBACK')
        return {
          httpStatus: 429,
          payload: { success: false, message: '인증번호 발송 횟수 한도를 초과했습니다.' },
        }
      }
    }

    const code = genSixDigitOtp()
    const identityId = identityRow?.id ?? newIdentityId()
    const otpHash = hashOtpCode(code, identityId, row.id)
    const ttlSec = getContractOtpExpiresSeconds()
    const expiresAt = new Date(now.getTime() + ttlSec * 1000)
    const ipHash = hashIpForContractOtp(clientIp, row.id)

    if (!identityRow) {
      await client.query(
        `
        INSERT INTO identity_verification_sessions (
          id, send_session_id, customer_id, provider, level, purpose,
          status, target_phone_masked, otp_hash, otp_sent_at, otp_expires_at,
          otp_attempt_count, otp_send_count, ip_hash, user_agent,
          created_at, updated_at
        )
        VALUES (
          $1, $2, $3, 'self_sms', 'phone_possession', 'contract_signature',
          'otp_sent', $4, $5, NOW(), $6,
          0, 1, $7, $8,
          NOW(), NOW()
        )
        `,
        [identityId, row.id, row.customer_id, maskedPhone, otpHash, expiresAt, ipHash, userAgent],
      )
    } else {
      await client.query(
        `
        UPDATE identity_verification_sessions
        SET
          status = 'otp_sent',
          target_phone_masked = COALESCE($2, target_phone_masked),
          otp_hash = $3,
          otp_sent_at = NOW(),
          otp_expires_at = $4,
          otp_attempt_count = 0,
          otp_send_count = COALESCE(otp_send_count, 0) + 1,
          last_error = NULL,
          ip_hash = COALESCE($5, ip_hash),
          user_agent = COALESCE($6, user_agent),
          updated_at = NOW()
        WHERE id = $1
        `,
        [identityRow.id, maskedPhone, otpHash, expiresAt, ipHash, userAgent],
      )
    }

    const sms = await sendContractSelfSmsOtp({
      phoneDigits: digits,
      code,
      purpose: 'contract_signature',
      clientIp,
    })
    if (!sms.ok) {
      await client.query('ROLLBACK')
      return {
        httpStatus: 503,
        payload: {
          success: false,
          message: '인증 문자를 발송할 수 없습니다. 잠시 후 다시 시도하거나 담당자에게 문의해 주세요.',
        },
      }
    }

    await client.query(
      `
      UPDATE contract_send_sessions
      SET
        opened_at = COALESCE(opened_at, NOW()),
        status = CASE WHEN status = 'pending' THEN 'opened' ELSE status END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [row.id],
    )

    await client.query('COMMIT')

    return {
      httpStatus: 200,
      payload: {
        success: true,
        data: {
          identitySessionId: identityRow?.id ?? identityId,
          maskedPhone,
          expiresInSeconds: ttlSec,
        },
      },
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    if (e instanceof Error && e.message.includes('CONTRACT_OTP_PEPPER')) {
      console.error(e.message)
      return {
        httpStatus: 500,
        payload: { success: false, message: '서버 설정 오류입니다. 관리자에게 문의해 주세요.' },
      }
    }
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ linkCode: string, codeRaw: string, clientIp: string, userAgent: string, body: unknown }} opts
 */
export async function contractOtpVerify(pool, opts) {
  const linkCode = String(opts.linkCode ?? '').trim()
  const clientIp = String(opts.clientIp ?? '')
  const userAgent = String(opts.userAgent ?? '').slice(0, 512)

  const bodyErr = assertNoPhoneFieldsInBody(opts.body)
  if (bodyErr) {
    return { httpStatus: 400, payload: { success: false, message: bodyErr } }
  }

  const code = String(opts.codeRaw ?? '').replace(/\D/g, '')
  if (!/^\d{6}$/.test(code)) {
    return { httpStatus: 400, payload: { success: false, message: '인증번호 6자리를 입력해 주세요.' } }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const row = await loadSendSessionWithCustomerPhone(client, linkCode)
    if (!row) {
      await client.query('ROLLBACK')
      return { httpStatus: 404, payload: { success: false, message: '발송 세션을 찾을 수 없습니다.' } }
    }

    const st = String(row.status ?? '')
    if (TERMINAL_SEND_SESSION.has(st)) {
      await client.query('ROLLBACK')
      return { httpStatus: 400, payload: { success: false, message: '유효하지 않은 발송 세션입니다.' } }
    }

    if (row.identity_session_id) {
      const done = await client.query(
        `SELECT status FROM identity_verification_sessions WHERE id = $1 LIMIT 1`,
        [row.identity_session_id],
      )
      const ist = String(done.rows[0]?.status ?? '')
      if (ist === 'verified') {
        await client.query('COMMIT')
        return {
          httpStatus: 200,
          payload: {
            success: true,
            data: {
              verified: true,
              provider: 'self_sms',
              level: 'phone_possession',
              sendSessionStatus: row.status,
            },
          },
        }
      }
    }

    const idRes = await client.query(
      `
      SELECT *
      FROM identity_verification_sessions
      WHERE send_session_id = $1
        AND status IN ('pending', 'otp_sent')
        AND otp_hash IS NOT NULL
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [row.id],
    )
    const idRow = idRes.rows[0]
    if (!idRow) {
      await client.query('ROLLBACK')
      return { httpStatus: 400, payload: { success: false, message: '먼저 인증번호를 요청해 주세요.' } }
    }

    const now = new Date()
    const exp = idRow.otp_expires_at ? new Date(idRow.otp_expires_at) : null
    if (exp && now.getTime() > exp.getTime()) {
      await client.query(
        `
        UPDATE identity_verification_sessions
        SET status = 'expired', last_error = 'otp_expired', updated_at = NOW()
        WHERE id = $1
        `,
        [idRow.id],
      )
      await client.query('COMMIT')
      return { httpStatus: 400, payload: { success: false, message: '인증번호가 만료되었습니다. 다시 요청해 주세요.' } }
    }

    const maxAtt = getContractOtpMaxAttempts()
    const attempts = Number(idRow.otp_attempt_count ?? 0)
    if (attempts >= maxAtt) {
      await client.query(
        `
        UPDATE identity_verification_sessions
        SET status = 'failed', last_error = 'max_attempts', updated_at = NOW()
        WHERE id = $1
        `,
        [idRow.id],
      )
      await client.query('COMMIT')
      return {
        httpStatus: 429,
        payload: { success: false, message: '인증 시도 횟수를 초과했습니다. 담당자에게 문의해 주세요.' },
      }
    }

    const expectedHash = String(idRow.otp_hash ?? '')
    const actualHash = hashOtpCode(code, idRow.id, row.id)
    if (actualHash !== expectedHash) {
      const next = attempts + 1
      const failSt = next >= maxAtt ? 'failed' : 'otp_sent'
      const lastErr = next >= maxAtt ? 'max_attempts' : 'otp_mismatch'
      await client.query(
        `
        UPDATE identity_verification_sessions
        SET
          otp_attempt_count = $2,
          status = $3,
          last_error = $4,
          updated_at = NOW()
        WHERE id = $1
        `,
        [idRow.id, next, failSt, lastErr],
      )
      await client.query('COMMIT')
      const status = next >= maxAtt ? 429 : 400
      return {
        httpStatus: status,
        payload: {
          success: false,
          message:
            next >= maxAtt
              ? '인증 시도 횟수를 초과했습니다. 담당자에게 문의해 주세요.'
              : '인증번호가 일치하지 않습니다.',
          remainingAttempts: Math.max(0, maxAtt - next),
        },
      }
    }

    const ipHash = hashIpForContractOtp(clientIp, row.id)
    await client.query(
      `
      UPDATE identity_verification_sessions
      SET
        status = 'verified',
        otp_verified_at = NOW(),
        last_error = NULL,
        ip_hash = COALESCE($2, ip_hash),
        user_agent = COALESCE($3, user_agent),
        updated_at = NOW()
      WHERE id = $1
      `,
      [idRow.id, ipHash, userAgent],
    )

    await client.query(
      `
      UPDATE contract_send_sessions
      SET
        identity_session_id = $2,
        status = CASE
          WHEN status IN ('pending', 'opened') THEN 'identity_verified'
          ELSE status
        END,
        updated_at = NOW()
      WHERE id = $1
      `,
      [row.id, idRow.id],
    )

    await client.query('COMMIT')
    return {
      httpStatus: 200,
      payload: {
        success: true,
        data: {
          verified: true,
          provider: 'self_sms',
          level: 'phone_possession',
          status: 'identity_verified',
        },
      },
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    if (e instanceof Error && e.message.includes('CONTRACT_OTP_PEPPER')) {
      console.error(e.message)
      return {
        httpStatus: 500,
        payload: { success: false, message: '서버 설정 오류입니다. 관리자에게 문의해 주세요.' },
      }
    }
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} linkCode
 */
export async function contractOtpStatus(pool, linkCode) {
  const row = await loadSendSessionWithCustomerPhone(pool, String(linkCode ?? '').trim())
  if (!row) {
    return { httpStatus: 404, payload: { success: false, message: '발송 세션을 찾을 수 없습니다.' } }
  }

  const phoneRes = resolveTargetDigits(row)
  let maskedPhone = String(row.target_phone_masked ?? '').trim()
  if (phoneRes.digits) {
    maskedPhone = displayMaskedPhone(row, phoneRes.digits)
  }

  let verified = false
  if (row.identity_session_id) {
    const r = await pool.query(`SELECT status FROM identity_verification_sessions WHERE id = $1 LIMIT 1`, [
      row.identity_session_id,
    ])
    verified = String(r.rows[0]?.status ?? '') === 'verified'
  }

  return {
    httpStatus: 200,
    payload: {
      success: true,
      data: {
        verified,
        sendSessionStatus: row.status,
        maskedPhone: maskedPhone || null,
      },
    },
  }
}
