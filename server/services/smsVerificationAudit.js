import { parseGaId } from '../lib/parseGaId.js'
import { systemQuery } from '../utils/dbSafeQuery.js'

/** 인증코드 행당 허용 오입력 횟수 (이후 코드 무효) */
const MAX_SMS_CODE_ATTEMPTS = 5

/**
 * 가장 최근 미사용·미만료 코드 1건에 대해 실패 횟수 +1, 5회 도달 시 used 처리.
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 */
export async function incrementLatestSmsCodeFailures(executor, { userId, phoneNumber, purpose }) {
  const uid = String(userId ?? '').trim()
  const phone = String(phoneNumber ?? '').trim()
  const p = String(purpose ?? '').trim()
  if (!uid || !phone || !p) {
    return
  }
  await systemQuery(
    executor,
    `
    WITH target AS (
      SELECT id FROM sms_verification_codes
      WHERE user_id = $1 AND phone_number = $2 AND purpose = $3
        AND used = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC, id DESC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE sms_verification_codes AS s
    SET
      attempt_count = COALESCE(s.attempt_count, 0) + 1,
      used = (COALESCE(s.attempt_count, 0) + 1 >= $4),
      verified_at = CASE
        WHEN COALESCE(s.attempt_count, 0) + 1 >= $4 THEN NOW()
        ELSE s.verified_at
      END
    FROM target t
    WHERE s.id = t.id
    `,
    [uid, phone, p, MAX_SMS_CODE_ATTEMPTS],
  )
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 */
export async function insertSmsVerificationLog(executor, {
  userId = null,
  phoneNumber,
  purpose,
  success,
  ip = '',
  userAgent = '',
}) {
  const phone = String(phoneNumber ?? '').trim()
  const p = String(purpose ?? '').trim()
  if (!phone || !p) {
    return
  }
  const uid = userId != null && String(userId).trim() !== '' ? String(userId).trim() : null
  const ipStr = String(ip ?? '').trim().slice(0, 128)
  const uaStr = String(userAgent ?? '').trim().slice(0, 512)
  await systemQuery(
    executor,
    `
    INSERT INTO sms_verification_logs (user_id, phone_number, purpose, success, ip, user_agent)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [uid, phone, p, Boolean(success), ipStr || 'unknown', uaStr],
  )
}

/**
 * 인증 성공 후 SMS 발송 요청 쿼터만 초기화 (발송 횟수 한도 리셋).
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 */
export async function clearUserSmsRequestQuota(executor, userId, gaId) {
  const uid = String(userId ?? '').trim()
  const gid = parseGaId(gaId)
  if (!uid || gid == null) {
    return
  }
  await systemQuery(
    executor,
    `
    UPDATE users SET
      sms_request_count = 0,
      sms_request_window_start = NULL,
      sms_auth_failure_count = 0,
      sms_blocked_until = NULL
    WHERE id = $1 AND ga_id = $2 AND is_deleted = false
    `,
    [uid, gid],
  )
}
