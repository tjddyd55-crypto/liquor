/**
 * 상환 import 입금자명 alias 정규화 — exact 비교용 최소 처리만.
 * trim + 영문 소문자 통일. 하이픈/공백/특수문자 제거 금지.
 */

/**
 * @param {unknown} value
 */
export function normalizeRepaymentAliasValue(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * @param {unknown} accountNumber
 */
export function maskAccountNumber(accountNumber) {
  const raw = String(accountNumber ?? '').trim()
  if (!raw) return ''
  if (raw.length <= 4) return '****'
  return `${'*'.repeat(Math.max(0, raw.length - 4))}${raw.slice(-4)}`
}
