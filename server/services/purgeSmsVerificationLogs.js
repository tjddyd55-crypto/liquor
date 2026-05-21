/**
 * sms_verification_logs 보관 정책 — 주기적 삭제용 (cron / 수동 스크립트).
 * 인증 파이프라인(WITH+SKIP LOCKED 등)과 무관.
 */

/** 기본 보관 기간(일). 환경변수 INSURANCE_SMS_LOG_RETENTION_DAYS 로 덮어쓸 수 있음 */
export const SMS_VERIFICATION_LOG_RETENTION_DAYS_DEFAULT = 30

export function resolveSmsLogRetentionDays() {
  const n = Number(process.env.INSURANCE_SMS_LOG_RETENTION_DAYS)
  if (Number.isFinite(n) && n >= 1) {
    return Math.floor(n)
  }
  return SMS_VERIFICATION_LOG_RETENTION_DAYS_DEFAULT
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 * @param {number} [retentionDays]
 * @returns {Promise<number>} 삭제된 행 수
 */
export async function deleteSmsVerificationLogsOlderThan(executor, retentionDays) {
  const days = Math.max(1, Math.floor(Number(retentionDays) || resolveSmsLogRetentionDays()))
  const r = await executor.query(
    `
    DELETE FROM sms_verification_logs
    WHERE created_at < NOW() - (CAST($1 AS integer) * INTERVAL '1 day')
    `,
    [days],
  )
  return r.rowCount ?? 0
}
