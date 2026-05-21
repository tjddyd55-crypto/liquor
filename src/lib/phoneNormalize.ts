/** 회원가입·SMS 인증 입력 공통 (한국 휴대폰) */
export function normalizeKrMobile(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\D/g, '')
}

export function validateKrMobileDigits(digits: string): string | null {
  if (!digits) {
    return '휴대폰 번호를 입력해 주세요.'
  }
  if (!/^01[0-9]\d{7,8}$/.test(digits)) {
    return '올바른 휴대폰 번호 형식이 아닙니다.'
  }
  return null
}
