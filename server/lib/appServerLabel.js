/**
 * 서버 시작 로그용 제품 라벨 (보험 / 정부지원 CRM 분기).
 * @module appServerLabel
 */

/**
 * @returns {'Government CRM' | 'Liquor CRM' | 'Insurance'}
 */
export function resolveServerProductLabel() {
  const product = String(process.env.APP_PRODUCT ?? process.env.APP_INDUSTRY ?? '')
    .trim()
    .toLowerCase()
  if (
    product === 'government' ||
    product === 'government-support' ||
    product === 'government_support' ||
    product.includes('government')
  ) {
    return 'Government CRM'
  }

  if (product === 'liquor' || product.includes('liquor')) {
    return 'Liquor CRM'
  }

  const r2Root = String(process.env.CRM_R2_OBJECT_ROOT ?? '').trim().toLowerCase()
  if (r2Root.includes('/government/') || r2Root.endsWith('/government')) {
    return 'Government CRM'
  }

  if (r2Root.includes('/liquor/') || r2Root.endsWith('/liquor')) {
    return 'Liquor CRM'
  }

  return 'Insurance'
}

/**
 * @param {number|string} port
 */
export function formatServerListeningMessage(port) {
  return `${resolveServerProductLabel()} server listening on port ${port}`
}

export function formatDbEngineMessage() {
  return `${resolveServerProductLabel()} DB engine: PostgreSQL`
}
