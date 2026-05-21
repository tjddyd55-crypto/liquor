import { useMemo } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import type { CustomerIndustryTemplate, TenantConfigWithCrm } from '../../customer-templates/customerTemplate.types'
import {
  getCustomerIndustryTemplateByIndustryCode,
  parseDynamicIndustryTemplateFromApi,
  resolveCustomerIndustryTemplatePreferringDynamic,
} from '../../customer-templates'

const FALLBACK_INSURANCE_CODE = 'insurance'

/**
 * 로그인 세션의 업종 브리지 + 템플릿 resolve 결과.
 * - SSOT 정적 배열 및 `resolveCustomerIndustryTemplateForTenant` 사용.
 * - 업종 코드 없음/미지원 시 보험 템플릿으로 폴백(기존 GA 동작 유지).
 */
export function useCustomerCrmIndustryContext() {
  const { user } = useAuth()

  return useMemo(() => {
    const rawIndustry = user?.crmIndustryCode ?? null
    const tenantCrm = user?.tenantCrm ?? null
    const tenantConfig: TenantConfigWithCrm | null = tenantCrm ? { crm: tenantCrm } : null

    const dynamicRaw = user?.crmDynamicIndustryTemplate
    const parsedDynamic = parseDynamicIndustryTemplateFromApi(dynamicRaw)

    const merged = resolveCustomerIndustryTemplatePreferringDynamic(
      rawIndustry,
      tenantConfig,
      parsedDynamic,
    )
    const insurance =
      getCustomerIndustryTemplateByIndustryCode(FALLBACK_INSURANCE_CODE) as CustomerIndustryTemplate

    const resolvedTemplate: CustomerIndustryTemplate = merged ?? insurance
    const isInsuranceLayout = resolvedTemplate.meta.industryCode === FALLBACK_INSURANCE_CODE

    return {
      rawIndustryCode: rawIndustry,
      tenantCrm,
      tenantConfig,
      resolvedTemplate,
      isInsuranceLayout,
    }
  }, [user?.crmIndustryCode, user?.tenantCrm, user?.crmDynamicIndustryTemplate])
}
