/**
 * 정부지원 CRM 프로그램 이용자(기관 코드) 가입 멤버십.
 * @module governmentSignup
 */

import { GOVERNMENT_INDUSTRY_CODE } from './constants.js'

export const GOVERNMENT_PROGRAM_USER_ROLE = 'government_user'

/**
 * @param {unknown} industryCodeNorm
 */
export function isGovernmentIndustrySignup(industryCodeNorm) {
  return String(industryCodeNorm ?? '').trim().toLowerCase() === GOVERNMENT_INDUSTRY_CODE
}

/**
 * 기관 코드 가입 시 government_user 멤버십 부여.
 * @param {import('pg').Pool | import('pg').PoolClient} poolExec
 * @param {{ userId: string, tenantDbId: number, industryId: number }} params
 */
export async function attachGovernmentProgramUserMembership(poolExec, params) {
  const userId = String(params.userId ?? '').trim()
  const tenantDbId = Number(params.tenantDbId)
  const industryId = Number(params.industryId)
  if (!userId || !Number.isSafeInteger(tenantDbId) || tenantDbId < 1) {
    throw new Error('government_user 멤버십 생성에 필요한 tenant 정보가 없습니다.')
  }
  if (!Number.isSafeInteger(industryId) || industryId < 1) {
    throw new Error('government_user 멤버십 생성에 필요한 industry 정보가 없습니다.')
  }
  const scopeId = String(tenantDbId)
  await poolExec.query(
    `
    INSERT INTO user_memberships (
      user_id, role, scope_type, scope_id, tenant_id, industry_id, status,
      membership_type, customer_access
    )
    SELECT
      $1::text,
      $2::text,
      'tenant',
      $3::text,
      $4::bigint,
      $5::bigint,
      'active',
      'agent',
      'own'
    WHERE NOT EXISTS (
      SELECT 1 FROM user_memberships m
      WHERE m.user_id = $1
        AND m.role = $2
        AND m.scope_type = 'tenant'
        AND m.tenant_id IS NOT DISTINCT FROM $4
    )
    `,
    [userId, GOVERNMENT_PROGRAM_USER_ROLE, scopeId, tenantDbId, industryId],
  )
}
