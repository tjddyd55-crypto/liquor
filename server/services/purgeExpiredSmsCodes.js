import { logExpiredSmsCodesPurged } from './smsStructuredLog.js'

/**
 * 만료된 SMS 인증코드 행 삭제 (주기 실행용).
 */
export async function purgeExpiredSmsVerificationCodes(pool) {
  const r = await pool.query(
    `DELETE FROM sms_verification_codes WHERE expires_at < NOW()`,
  )
  const n = r.rowCount ?? 0
  if (n > 0) {
    logExpiredSmsCodesPurged(n)
  }
  return n
}
