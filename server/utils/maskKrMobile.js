/**
 * 계약 공개 링크 등에서 표시용 휴대폰 마스킹 (원문 로그/응답 금지 정책과 별개로 UI용)
 * @param {string} digits 01012345678 형태 숫자만
 * @returns {string}
 */
export function maskKrMobileForDisplay(digits) {
  const d = String(digits ?? '').replace(/\D/g, '')
  if (d.length >= 11 && d.startsWith('010')) {
    const tail = d.slice(-4)
    return `010-****-${tail}`
  }
  if (d.length >= 10) {
    return `****-${d.slice(-4)}`
  }
  if (d.length >= 4) {
    return `****${d.slice(-4)}`
  }
  return '****'
}
