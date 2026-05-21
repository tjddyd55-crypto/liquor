/** @param {unknown} value */
export function parseGaId(value) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}
