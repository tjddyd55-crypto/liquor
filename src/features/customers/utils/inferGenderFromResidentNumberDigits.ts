/**
 * 한국 주민등록번호(또는 외국인 등록번호) — 숫자만 모았을 때 7번째 자리 성별 코드.
 * 1, 3, 5, 7, 9 → 남 / 2, 4, 6, 8, 0 → 여 (제품 규칙 고정).
 */
export function inferGenderFromResidentNumberDigits(raw: string | null | undefined): 'male' | 'female' | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length < 7) {
    return null
  }
  const code = digits[6]
  if (/[13579]/.test(code)) {
    return 'male'
  }
  if (/[24680]/.test(code)) {
    return 'female'
  }
  return null
}

/** 성별 미선택일 때만 주민번호로 추론. 값이 이미 있으면 유지(DB·사용자 선택 보호). */
export function resolveGenderAfterSsnInput(
  currentGender: 'male' | 'female' | null,
  nextSsn: string,
): 'male' | 'female' | null {
  if (currentGender != null) {
    return currentGender
  }
  return inferGenderFromResidentNumberDigits(nextSsn) ?? null
}
