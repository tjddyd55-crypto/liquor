/**
 * 정부지원 대행사(tenant) 가입 코드 — DB CHECK 제약에 맞는 값으로 upsert.
 * @module ensureGovernmentTenantRegistrationCode
 */
import { GOVERNMENT_INDUSTRY_CODE } from './constants.js'

/**
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {{ agencyCode: string, tenantId: string | number }} params
 */
export async function ensureGovernmentTenantRegistrationCode(exec, params) {
  const agencyCode = String(params.agencyCode ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
  const tenantId = params.tenantId
  if (!agencyCode || agencyCode.length < 3) {
    throw new Error('agencyCode가 필요합니다.')
  }
  if (tenantId == null || String(tenantId).trim() === '') {
    throw new Error('tenantId가 필요합니다.')
  }

  await exec.query(
    `
    INSERT INTO tenant_registration_codes (
      code, tenant_id, industry_code, default_membership_type, default_customer_access,
      default_role, status
    )
    VALUES ($1, $2::bigint, $3, 'agent', 'own', 'user', 'active')
    ON CONFLICT (code) DO UPDATE SET
      tenant_id = EXCLUDED.tenant_id,
      industry_code = EXCLUDED.industry_code,
      default_membership_type = EXCLUDED.default_membership_type,
      default_customer_access = EXCLUDED.default_customer_access,
      default_role = EXCLUDED.default_role,
      status = 'active',
      updated_at = NOW()
    `,
    [agencyCode, tenantId, GOVERNMENT_INDUSTRY_CODE],
  )
}
