/** DB·JSON에서 숫자/null로 올 수 있는 필드 공통 (trim 전용) */
export function asTrimmedText(value: string | number | null | undefined): string {
  return String(value ?? '').trim()
}

/** DB·JSON에서 숫자/null로 올 수 있음 → 항상 문자열로 처리 */
export function normalizePhoneNumber(raw: string | number | null | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

/** tel: 등에 쓰는 숫자만 추출 */
export function cleanPhone(phone: string | number | null | undefined): string {
  return normalizePhoneNumber(phone)
}

/**
 * 입력에 하이픈·대시 등 분절 표기가 있으면 자동 재분절하지 않고 그대로 표시한다.
 * (1578-2222·지역번호·대표번호 등 숫자만 규칙으로 맞추기 어려운 경우를 피한다.)
 */
function preferRawPhoneDisplay(raw: string): boolean {
  return /[-–—‐‑‒﹣]/.test(String(raw ?? ''))
}

/**
 * 보험사 연락처 카드 표시용. 하이픈이 있으면 원문 유지, 숫자만이면 패턴별 분절.
 */
export function formatPhone(phone: string | number | null | undefined): string {
  const trimmed = String(phone ?? '').trim()
  if (!trimmed) {
    return ''
  }
  if (preferRawPhoneDisplay(trimmed)) {
    return trimmed
  }

  const digits = normalizePhoneNumber(trimmed)
  if (!digits) {
    return trimmed
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    }
  }

  if (/^01[016789]/.test(digits)) {
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    }
  }

  if (digits.length === 9 && digits.startsWith('15')) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }
  if (
    digits.length === 10 &&
    (digits.startsWith('15') || digits.startsWith('16') || digits.startsWith('18'))
  ) {
    const p =
      digits.startsWith('1544') || digits.startsWith('1566') || digits.startsWith('1577') ? 4 : 3
    return `${digits.slice(0, p)}-${digits.slice(p)}`
  }

  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  return digits
}

export function formatPhoneNumber(raw: string | number | null | undefined): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) {
    return ''
  }
  if (preferRawPhoneDisplay(trimmed)) {
    return trimmed
  }

  const digits = normalizePhoneNumber(trimmed)
  if (!digits) {
    return ''
  }

  if (digits.startsWith('02')) {
    if (digits.length === 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`
    }
    if (digits.length === 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`
    }
  }

  if (/^01[016789]/.test(digits)) {
    if (digits.length === 10) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
    }
    if (digits.length === 11) {
      return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    }
  }

  if (digits.length === 9 && digits.startsWith('15')) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }
  if (
    digits.length === 10 &&
    (digits.startsWith('15') || digits.startsWith('16') || digits.startsWith('18'))
  ) {
    const p =
      digits.startsWith('1544') || digits.startsWith('1566') || digits.startsWith('1577') ? 4 : 3
    return `${digits.slice(0, p)}-${digits.slice(p)}`
  }

  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
  }

  return digits
}
