/**
 * CRM-Platform 메타 조회 헬퍼 (1차 스키마).
 * initDb 에서 생성한 industries / tenants / user_memberships 만 대상으로 한다.
 * 기존 requireAuth·JWT·RBAC 가드에 연결하지 말 것(별도 rollout).
 *
 * executor: pg Pool 또는 Queryable (.query 메서드)
 */

/**
 * @param {unknown} legacyRole users.role 원문 (대소문자 무시)
 * @returns {{ role: string, scopeType: string } | null} user_memberships.role / scope_type 과 정합
 */
export function mapLegacyRoleToMembershipRole(legacyRole) {
  const r = String(legacyRole ?? '')
    .trim()
    .toUpperCase()
  if (r === 'SUPER_ADMIN') {
    return { role: 'super_admin', scopeType: 'platform' }
  }
  if (r === 'GA_ADMIN') {
    return { role: 'tenant_admin', scopeType: 'tenant' }
  }
  if (r === 'GA_STAFF') {
    return { role: 'staff', scopeType: 'tenant' }
  }
  if (r === 'USER') {
    return { role: 'user', scopeType: 'tenant' }
  }
  return null
}

/**
 * ga_companies.id → tenants (legacy_ga_id 매칭, status=active 우선 단일 행)
 * @param {import('pg').Pool | { query: Function }} executor
 * @param {number | null | undefined} gaId
 */
export async function resolveTenantByGaId(executor, gaId) {
  if (gaId == null || !Number.isFinite(Number(gaId))) {
    return null
  }
  const { rows } = await executor.query(
    `
    SELECT *
    FROM tenants
    WHERE legacy_ga_id = $1 AND status = 'active'
    LIMIT 1
    `,
    [gaId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} executor
 * @param {number | bigint | null | undefined} tenantId
 */
export async function resolveIndustryByTenantId(executor, tenantId) {
  if (tenantId == null || String(tenantId).trim() === '') {
    return null
  }
  const { rows } = await executor.query(
    `
    SELECT i.*
    FROM industries i
    INNER JOIN tenants t ON t.industry_id = i.id
    WHERE t.id = $1
    LIMIT 1
    `,
    [tenantId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool | { query: Function }} executor
 * @param {string | null | undefined} userId
 */
export async function resolveMembershipsForUser(executor, userId) {
  if (userId == null || String(userId).trim() === '') {
    return []
  }
  const { rows } = await executor.query(
    `
    SELECT *
    FROM user_memberships
    WHERE user_id = $1 AND status = 'active'
    ORDER BY id ASC
    `,
    [userId],
  )
  return rows
}
