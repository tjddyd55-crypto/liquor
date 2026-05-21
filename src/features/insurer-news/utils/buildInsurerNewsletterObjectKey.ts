/**
 * R2 객체 키 조합 (정책: insurer/{gaId}/{insuranceCompany}/newsletters/{newsletterId}/...).
 * insuranceCompany segment는 내부 insurerCode 사용.
 */

export function buildInsurerNewsletterFolderPrefix(params: {
  gaId: number | string
  /** 스토리지 segment — UI와 별개 */
  insurerCode: string
  newsletterId: string
}): string {
  const ga = String(params.gaId).trim()
  const ins = params.insurerCode.trim()
  const id = params.newsletterId.trim()
  return `insurer/${ga}/${ins}/newsletters/${id}`
}

export function buildInsurerNewsletterObjectKey(params: {
  gaId: number | string
  insurerCode: string
  newsletterId: string
  /** 파일명 — 타임스탬프-역할-순번.ext 권장 */
  fileName: string
}): string {
  const base = buildInsurerNewsletterFolderPrefix({
    gaId: params.gaId,
    insurerCode: params.insurerCode,
    newsletterId: params.newsletterId,
  })
  const name = params.fileName.replace(/^\/+/, '').replace(/\\/g, '_')
  return `${base}/${name}`
}
