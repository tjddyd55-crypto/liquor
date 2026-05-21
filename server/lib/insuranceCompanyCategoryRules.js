/**
 * 도메인 규칙: 메리츠(손해보험/화재)는 항상 손해(NON_LIFE).
 * 엑셀·UI에서 생명으로 잘못 넣어도 DB는 손해로 맞춤.
 *
 * @param {string} category
 * @param {string} companyName
 * @returns {string}
 */
export function coerceMeritzFireToNonLifeCategory(category, companyName) {
  const name = String(companyName ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const isMeritz =
    name === '메리츠' ||
    name === '메리츠화재' ||
    name === '메리츠 화재' ||
    (name.startsWith('메리츠') && name.includes('화재'))
  if (isMeritz) {
    return 'NON_LIFE'
  }
  return String(category ?? '').trim()
}

/** @param {string} name */
export function isMeritzFireCompanyName(name) {
  const n = String(name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return (
    n === '메리츠' ||
    n === '메리츠화재' ||
    n === '메리츠 화재' ||
    (n.startsWith('메리츠') && n.includes('화재'))
  )
}
