/**
 * API/DB에서 id가 문자열·숫자로 섞여 올 때 선택·비교가 깨지지 않게 양의 정수로 통일한다.
 */
export function coercePositiveIntId(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
  const s = String(raw).trim()
  if (!/^\d+$/.test(s)) return null
  const n = Number(s)
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
