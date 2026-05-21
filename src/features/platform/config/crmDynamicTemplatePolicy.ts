/**
 * 서버 `crmDynamicTemplatePolicy.js` 와 동일한 정책 — 관리 UI 분기용.
 */
export function industryAllowsDynamicCrmCustomerTemplates(industryCode: string | null | undefined): boolean {
  const ic = industryCode != null ? String(industryCode).trim().toLowerCase() : ''
  return ic.length > 0 && ic !== 'insurance'
}
