/**
 * 테넌트 멤버십 기반 로그인 브리지(customerAccess 등).
 */

import { systemQuery } from '../utils/dbSafeQuery.js'

/**
 * 같은 GA(legacy_ga_id) 테넌트에 속한 활성 멤버십이 있는데 모두 비활성화된 경우 로그인을 막는다.
 * 멤버십 행이 전혀 없으면 레거시 계정으로 간주해 통과.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {number | null} gaId
 * @returns {Promise<{ blocked: boolean; reason?: string }>}
 */
export async function evaluateTenantMembershipLoginBlock(pool, userId, gaId) {
  if (gaId == null || !Number.isInteger(gaId) || gaId < 1) {
    return { blocked: false }
  }
  const uid = String(userId ?? '').trim()
  if (!uid) {
    return { blocked: false }
  }

  const r = await systemQuery(
    pool,
    `
    SELECT
      COUNT(*)::int AS total_ct,
      COUNT(*) FILTER (
        WHERE LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
      )::int AS active_ct
    FROM user_memberships m
    INNER JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = $1
      AND m.scope_type = 'tenant'
      AND m.tenant_id IS NOT NULL
      AND t.legacy_ga_id IS NOT DISTINCT FROM $2
    `,
    [uid, gaId],
  )
  const row = r.rows[0]
  const total = Number(row?.total_ct ?? 0) || 0
  const activeCt = Number(row?.active_ct ?? 0) || 0
  if (total > 0 && activeCt === 0) {
    return { blocked: true, reason: 'tenant_membership_all_inactive' }
  }
  return { blocked: false }
}

/**
 * GA(legacy_ga_id)과 정렬된 활성 테넌트 멤버십 하나를 고른다(MVP: tenant switcher 없음).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {number | null} gaId
 */
export async function pickPrimaryTenantMembershipForLogin(pool, userId, gaId) {
  const uid = String(userId ?? '').trim()
  if (!uid) {
    return null
  }

  if (gaId == null || !Number.isInteger(gaId) || gaId < 1) {
    return null
  }

  const q = await systemQuery(
    pool,
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      m.role AS membership_rbac_role,
      m.scope_type,
      m.scope_id,
      m.tenant_id,
      m.industry_id,
      m.membership_type,
      m.customer_access,
      m.status AS membership_status,
      t.code AS tenant_code,
      t.status AS tenant_row_status,
      t.legacy_ga_id,
      ic.code AS tenant_industry_code,
      t.crm_customer_template_id
    FROM user_memberships m
    INNER JOIN tenants t ON t.id = m.tenant_id
    INNER JOIN industries ic ON ic.id = t.industry_id
    WHERE m.user_id = $1
      AND m.scope_type = 'tenant'
      AND m.tenant_id IS NOT NULL
      AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
      AND LOWER(TRIM(COALESCE(t.status::text, ''))) = 'active'
      AND t.legacy_ga_id IS NOT DISTINCT FROM $2
    ORDER BY
      CASE LOWER(TRIM(COALESCE(m.role::text, '')))
        WHEN 'tenant_admin' THEN 1
        WHEN 'staff' THEN 2
        WHEN 'user' THEN 3
        ELSE 9
      END ASC,
      m.id ASC
    LIMIT 1
    `,
    [uid, gaId],
  )

  return q.rows[0] ?? null
}
