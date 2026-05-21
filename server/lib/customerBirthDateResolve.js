/**
 * 고객 생년월일 YYYY-MM-DD — birth_date 컬럼 우선, 없으면 주민번호 앞 7자리로 파생.
 * 주민번호 전체는 반환·로그하지 않는다.
 */

function formatDateYmdFromDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function formatDateYmdFromRaw(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    return formatDateYmdFromDate(value)
  }
  const str = String(value).trim()
  if (!str) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10)
  return ''
}

/** 주민번호 앞 7자리로 생년월일 파싱 (1,2 → 19xx / 3,4 → 20xx) */
export function parseBirthDateFromRrn(rrn) {
  const clean = String(rrn ?? '').replace(/[^0-9]/g, '')
  if (clean.length < 7) {
    return null
  }

  const birth = clean.substring(0, 6)
  const genderCode = clean[6]

  let yearPrefix = null
  if (genderCode === '1' || genderCode === '2') {
    yearPrefix = '19'
  } else if (genderCode === '3' || genderCode === '4') {
    yearPrefix = '20'
  }
  if (!yearPrefix) {
    return null
  }

  const year = Number(yearPrefix + birth.substring(0, 2))
  const month = Number(birth.substring(2, 4))
  const day = Number(birth.substring(4, 6))

  const birthDate = new Date(year, month - 1, day)
  if (
    Number.isNaN(birthDate.getTime()) ||
    birthDate.getFullYear() !== year ||
    birthDate.getMonth() !== month - 1 ||
    birthDate.getDate() !== day
  ) {
    return null
  }

  return birthDate
}

/**
 * @param {{ birthDate?: unknown, birth_date?: unknown, ssn?: unknown } | null | undefined} customer
 * @returns {string}
 */
export function resolveCustomerBirthDateYmd(customer) {
  if (!customer || typeof customer !== 'object') {
    return ''
  }
  const fromColumn = formatDateYmdFromRaw(customer.birthDate ?? customer.birth_date)
  if (fromColumn) {
    return fromColumn
  }
  const fromRrn = parseBirthDateFromRrn(customer.ssn)
  if (!fromRrn) {
    return ''
  }
  return formatDateYmdFromDate(fromRrn)
}
