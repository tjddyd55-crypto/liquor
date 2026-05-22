/**
 * 주류회사 전자서명 R2 객체 key prefix (보험 contracts / 정부 government 경로와 분리).
 */
export function liquorSignatureObjectRootPrefix() {
  const root = String(process.env.CRM_R2_OBJECT_ROOT ?? '').trim().replace(/\/+$/, '')
  if (root) return `${root}/signatures`
  return 'liquor/signatures'
}

/**
 * @param {string} relativePath root 이후 상대 경로 (leading slash 없음)
 */
export function buildLiquorSignatureObjectKey(relativePath) {
  const rel = String(relativePath ?? '').replace(/^\/+/, '')
  return `${liquorSignatureObjectRootPrefix()}/${rel}`
}
