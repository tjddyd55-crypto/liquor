/**
 * SMS 인증코드 검증 실패 누적 시 계정 단위 일시 잠금 (브루트포스 완화).
 * consumeSmsVerificationCode / attempt_count(SKIP LOCKED) 경로와 독립.
 */

import { parseGaId } from '../lib/parseGaId.js'
import { systemQuery } from '../utils/dbSafeQuery.js'

/** 연속 오인증 횟수가 이 값 이상이면 잠금 */
export const SMS_ACCOUNT_LOCK_FAILURE_THRESHOLD = 10

/** 잠금 지속 시간(분) — 요구사항 범위 5~10분 중 10분 */
export const SMS_ACCOUNT_LOCK_DURATION_MINUTES = 10

/**
 * @param {{ sms_blocked_until?: Date|string|null }} userRow
 * @returns {{ ok: true } | { ok: false, message: string, retryAfterSec: number, retryAfterMin: number }}
 */
export function assertNotSmsAccountLocked(userRow) {
  const until = userRow?.sms_blocked_until
  if (until == null || until === '') {
    return { ok: true }
  }
  const now = Date.now()
  const t = new Date(until).getTime()
  if (Number.isNaN(t) || t <= now) {
    return { ok: true }
  }
  const retryAfterSec = Math.max(1, Math.ceil((t - now) / 1000))
  const retryAfterMin = Math.max(1, Math.ceil((t - now) / 60000))
  return {
    ok: false,
    message: `인증 시도가 많아 ${retryAfterMin}분 후 다시 시도해 주세요.`,
    retryAfterSec,
    retryAfterMin,
  }
}

/**
 * 검증 실패(코드 불일치 등) 1회 반영. 임계 도달 시 sms_blocked_until 설정 후 연속 카운트 리셋.
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 */
export async function recordUserSmsVerificationFailure(executor, userId, gaId) {
  const uid = String(userId ?? '').trim()
  const gid = parseGaId(gaId)
  if (!uid || gid == null) {
    return
  }
  await systemQuery(
    executor,
    `
    UPDATE users SET
      sms_auth_failure_count = CASE
        WHEN COALESCE(sms_auth_failure_count, 0) + 1 >= $3 THEN 0
        ELSE COALESCE(sms_auth_failure_count, 0) + 1
      END,
      sms_blocked_until = CASE
        WHEN COALESCE(sms_auth_failure_count, 0) + 1 >= $3
          THEN NOW() + ($4 * INTERVAL '1 minute')
        ELSE sms_blocked_until
      END
    WHERE id = $1 AND ga_id = $2 AND is_deleted = false
    `,
    [uid, gid, SMS_ACCOUNT_LOCK_FAILURE_THRESHOLD, SMS_ACCOUNT_LOCK_DURATION_MINUTES],
  )
}
