/**
 * 휴대폰 완화 모드는 명시적으로만 켭니다: INSURANCE_SIGNUP_PHONE_RELAXED=1|true|yes|on
 *
 * 미설정·0·false·off → 엄격 모드 (번호 필수, SMS 인증 JWT 필수, 활성 계정 기준 중복 차단).
 * 로컬·스테이징에서만 완화가 필요하면 위 값으로 켜세요.
 */
export function isSignupPhoneRelaxedMode() {
  const v = String(process.env.INSURANCE_SIGNUP_PHONE_RELAXED ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}
