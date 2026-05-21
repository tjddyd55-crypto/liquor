/**
 * 관리자 — 프로그램 이용자(government_user) 조회·요약 (사업장/고객 원본은 assignment 전까지 미노출).
 * @module governmentProgramUsers
 */
import { GOVERNMENT_PROGRAM_USER_ROLE } from './governmentSignup.js'
import { resolveGovernmentUserManagerScope } from './governmentAdminUsers.js'

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[] }} scope
 * @param {string} userId
 */
export async function assertManagerCanAccessProgramUser(pool, scope, userId) {
  const uid = String(userId ?? '').trim()
  if (!uid) {
    return { ok: false, status: 400, message: 'userId가 필요합니다.' }
  }
  const params = [uid, GOVERNMENT_PROGRAM_USER_ROLE]
  const tenantGuard = scope.fullAccess
    ? ''
    : `AND m.tenant_id::text = ANY($3::text[])`
  if (!scope.fullAccess) {
    params.push(scope.tenantIds)
  }
  const r = await pool.query(
    `
    SELECT
      u.id::text AS id,
      u.username,
      COALESCE(u.display_name, '') AS display_name,
      LOWER(TRIM(COALESCE(u.status, 'active'))) AS status,
      u.created_at,
      u.last_login_at,
      m.tenant_id::text AS tenant_id,
      t.name AS tenant_name,
      t.code AS agency_code
    FROM users u
    INNER JOIN user_memberships m ON m.user_id = u.id AND m.role = $2
    LEFT JOIN tenants t ON t.id = m.tenant_id
    WHERE u.id = $1::text
      AND COALESCE(u.is_deleted, false) IS NOT TRUE
      ${tenantGuard}
    LIMIT 1
    `,
    params,
  )
  const row = r.rows[0]
  if (!row) {
    return { ok: false, status: 404, message: '이용자를 찾을 수 없습니다.' }
  }
  return {
    ok: true,
    row: {
      id: String(row.id),
      username: String(row.username ?? ''),
      displayName: String(row.display_name ?? ''),
      status: String(row.status ?? 'active'),
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
      tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
      tenantName: String(row.tenant_name ?? ''),
      agencyCode: String(row.agency_code ?? ''),
      role: GOVERNMENT_PROGRAM_USER_ROLE,
    },
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} ownerUserId
 * @param {string|null} tenantId
 */
export async function summarizeProgramUserProfiles(pool, ownerUserId, tenantId) {
  const params = [ownerUserId]
  let tenantSql = ''
  if (tenantId) {
    tenantSql = 'AND tenant_id = $2::bigint'
    params.push(tenantId)
  }
  const r = await pool.query(
    `
    SELECT
      COUNT(*)::int AS profile_count,
      MAX(updated_at) AS last_updated_at,
      (
        SELECT progress_status
        FROM gov_support_profiles
        WHERE owner_user_id = $1::text
          AND owner_user_id IS NOT NULL
          ${tenantSql}
        ORDER BY updated_at DESC NULLS LAST, id DESC
        LIMIT 1
      ) AS latest_progress_status
    FROM gov_support_profiles
    WHERE owner_user_id = $1::text
      AND owner_user_id IS NOT NULL
      ${tenantSql}
    `,
    params,
  )
  const row = r.rows[0] ?? {}
  return {
    profileCount: Number(row.profile_count ?? 0) || 0,
    latestProgressStatus: row.latest_progress_status != null ? String(row.latest_progress_status) : null,
    lastUpdatedAt: row.last_updated_at ?? null,
    assignedStaffUserId: null,
    assignedStaffDisplayName: null,
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} userId
 */
export async function getProgramUserDetailForManager(pool, ctx, userId) {
  const scope = await resolveGovernmentUserManagerScope(pool, ctx)
  if (!scope.ok) {
    return { ok: false, status: scope.status, message: scope.message }
  }
  const access = await assertManagerCanAccessProgramUser(pool, scope, userId)
  if (!access.ok) {
    return access
  }
  return {
    ok: true,
    data: {
      ...access.row,
      profilesAccessible: false,
      profilesAccessNote:
        '사업장/고객/신청 원본 데이터는 이용자 본인 워크스페이스에서만 관리합니다. 운영 계정은 계정·상태만 확인할 수 있습니다.',
    },
  }
}
