/**
 * 동적 CRM 고객 관리 템플릿 적용 여부 — bootstrap·관리 UI 안내와 로직을 같은 정책으로 맞춘다.
 */

/**
 * @param {string | null | undefined} industryCode
 * @returns {boolean} true면 세션 bootstrap에서 동적 템플릿 후보를 로드한다(insurance 제외).
 */
export function industryAllowsDynamicCrmCustomerTemplates(industryCode) {
  const ic = industryCode != null ? String(industryCode).trim().toLowerCase() : ''
  return ic.length > 0 && ic !== 'insurance'
}
