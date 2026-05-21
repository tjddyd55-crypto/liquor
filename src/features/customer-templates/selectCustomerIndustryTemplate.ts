import type { CustomerIndustryTemplate, TenantConfigWithCrm } from './customerTemplate.types'
import { resolveCustomerTemplate } from './resolveCustomerTemplate'
import { STATIC_CUSTOMER_INDUSTRY_TEMPLATES } from './staticCustomerIndustryTemplates'

/**
 * 레지스트리/필드 정의 등에서 domain 으로 쓰이는 문자열과
 * 업종 마스터 `industries.code` 가 다를 때 템플릿을 같은 뼈대로 붙일 수 있게 한다.
 *
 * 신규 별칭은 최소만 유지하고, 장기적으로는 DB 코드와 통일하는 것이 목표다.
 */
const RAW_INDUSTRY_CODE_TO_TEMPLATE_INDUSTRY_CODE: Record<string, string> = {
  gov_support: 'government',
  gov: 'government',
}

function normalizeIndustryLookupKey(raw: string | null | undefined): string | null {
  const t = String(raw ?? '').trim().toLowerCase()
  if (!t) return null
  return RAW_INDUSTRY_CODE_TO_TEMPLATE_INDUSTRY_CODE[t] ?? t
}

/** `industries.code`(또는 동일 의미의 별칭)으로 정적 업종 템플릿을 찾는다. 없으면 null. */
export function getCustomerIndustryTemplateByIndustryCode(
  industryCode: string | null | undefined,
): CustomerIndustryTemplate | null {
  const key = normalizeIndustryLookupKey(industryCode)
  if (!key) return null
  return STATIC_CUSTOMER_INDUSTRY_TEMPLATES.find((tpl) => tpl.meta.industryCode === key) ?? null
}

/**
 * tenant.config 크기의 CRM 패치까지 반영한 인스턴스 템플릿.
 * 폼 고객 CRM 화면·서버 검증 고도화 때 동일 이름으로 재사용할 것.
 */
export function resolveCustomerIndustryTemplateForTenant(
  industryCode: string | null | undefined,
  tenantConfig?: TenantConfigWithCrm | null,
): CustomerIndustryTemplate | null {
  const base = getCustomerIndustryTemplateByIndustryCode(industryCode)
  if (!base) return null
  return resolveCustomerTemplate(base, tenantConfig)
}

/**
 * 세션에 실려 온 동적 템플릿 → 정적 fallback.
 * - 보험(insurance)은 동적 템플릿을 무시하고 정적 보험 템플릿만 사용한다.
 */
export function resolveCustomerIndustryTemplatePreferringDynamic(
  industryCode: string | null | undefined,
  tenantConfig: TenantConfigWithCrm | null | undefined,
  dynamicTemplate: CustomerIndustryTemplate | null | undefined,
): CustomerIndustryTemplate | null {
  const key = normalizeIndustryLookupKey(industryCode)
  if (key === 'insurance') {
    const base = getCustomerIndustryTemplateByIndustryCode('insurance')
    if (!base) return null
    return resolveCustomerTemplate(base, tenantConfig ?? null)
  }
  const dynKey = dynamicTemplate ? normalizeIndustryLookupKey(dynamicTemplate.meta.industryCode) : null
  if (dynamicTemplate && key && dynKey && dynKey === key) {
    return resolveCustomerTemplate(dynamicTemplate, tenantConfig ?? null)
  }
  return resolveCustomerIndustryTemplateForTenant(industryCode, tenantConfig ?? null)
}
