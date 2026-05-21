/**
 * 한국 휴대폰 번호 정규화·검증 (저장/인증 공통)
 */

export function normalizeKrMobile(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/\D/g, '')
}

/** @returns {string | null} 오류 메시지 또는 null */
export function validateKrMobileDigits(digits) {
  if (!digits) {
    return '휴대폰 번호를 입력해 주세요.'
  }
  if (!/^01[0-9]\d{7,8}$/.test(digits)) {
    return '올바른 휴대폰 번호 형식이 아닙니다.'
  }
  return null
}
