/**
 * 서버 `INSURANCE_SIGNUP_PHONE_RELAXED` 와 같은 규칙: 완화는 VITE_=1|true|yes|on 일 때만.
 * 미설정·0·false·off → 엄격 모드 (회원가입 UI·제출 검증).
 */
export function isSignupPhoneRelaxedMode(): boolean {
  const v = String(import.meta.env.VITE_INSURANCE_SIGNUP_PHONE_RELAXED ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}
