import { selectCrmBootstrapExtendedForLegacyGa } from './loadDynamicCustomerIndustryTemplateForBootstrap.js'

export { selectCrmBootstrapExtendedForLegacyGa }

/**
 * 레거시 호환: 업종 코드 + tenant.config.crm 만 반환한다.
 *
 * @param {import('pg').Pool} pool
 * @param {number | null | undefined} gaId
 * @returns {Promise<{ industryCode: string | null, tenantCrm: Record<string, unknown> | null }>}
 */
export async function selectCrmBootstrapForLegacyGa(pool, gaId) {
  const ext = await selectCrmBootstrapExtendedForLegacyGa(pool, gaId)
  return {
    industryCode: ext.industryCode,
    tenantCrm: ext.tenantCrm,
  }
}
