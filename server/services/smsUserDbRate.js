/**
 * users 테이블 컬럼 기반 SMS 요청 한도 (1분 쿨다운 + 1시간당 5회).
 */

const COOLDOWN_MS = 60_000
const WINDOW_MS = 3_600_000
const MAX_PER_HOUR = 5

/**
 * @param {{ last_sms_requested_at?: Date|string|null, sms_request_count?: number|null, sms_request_window_start?: Date|string|null }} row
 * @returns {{ ok: true, nextCount: number, resetWindow: boolean } | { ok: false, message: string, retryAfterSec: number }}
 */
export function evaluateUserSmsRequestQuota(row) {
  const nowMs = Date.now()
  const lastMs = row.last_sms_requested_at
    ? new Date(row.last_sms_requested_at).getTime()
    : null

  if (lastMs != null && !Number.isNaN(lastMs) && nowMs - lastMs < COOLDOWN_MS) {
    return {
      ok: false,
      message: '잠시 후 다시 시도해 주세요 (1분 제한).',
      retryAfterSec: Math.max(1, Math.ceil((COOLDOWN_MS - (nowMs - lastMs)) / 1000)),
    }
  }

  const windowMs = row.sms_request_window_start
    ? new Date(row.sms_request_window_start).getTime()
    : null
  let count = Number(row.sms_request_count ?? 0)

  if (windowMs == null || Number.isNaN(windowMs)) {
    return { ok: true, nextCount: 1, resetWindow: true }
  }

  const elapsed = nowMs - windowMs
  if (elapsed > WINDOW_MS) {
    return { ok: true, nextCount: 1, resetWindow: true }
  }

  if (count >= MAX_PER_HOUR) {
    return {
      ok: false,
      message: '인증 요청 횟수를 초과했습니다 (1시간 후 재시도).',
      retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)),
    }
  }

  return { ok: true, nextCount: count + 1, resetWindow: false }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} userId
 * @param {{ nextCount: number, resetWindow: boolean }} quota
 * @param {number} gaId
 */
export async function applyUserSmsRequestAfterSend(client, userId, quota, gaId) {
  const uid = String(userId ?? '').trim()
  const gid = Number(gaId)
  if (!uid || !Number.isInteger(gid) || gid < 1) {
    throw new Error('applyUserSmsRequestAfterSend: userId and gaId required')
  }
  if (quota.resetWindow) {
    await client.query(
      `
      UPDATE users SET
        last_sms_requested_at = NOW(),
        sms_request_count = $1,
        sms_request_window_start = NOW()
      WHERE id = $2 AND ga_id = $3 AND is_deleted = false
      `,
      [quota.nextCount, uid, gid],
    )
  } else {
    await client.query(
      `
      UPDATE users SET
        last_sms_requested_at = NOW(),
        sms_request_count = $1
      WHERE id = $2 AND ga_id = $3 AND is_deleted = false
      `,
      [quota.nextCount, uid, gid],
    )
  }
}
