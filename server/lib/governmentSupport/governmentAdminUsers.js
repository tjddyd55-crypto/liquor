/**
 * government-support 관리자 사용자 CRUD.
 * @module governmentAdminUsers
 */

import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import {
  isGovernmentIndustryAdmin,
  isGovernmentSuperAdmin,
  resolveGovernmentCrmGaId,
  resolveGovernmentIndustryId,
} from './governmentAccess.js'
import {
  GOVERNMENT_INDUSTRY_CODE,
  GOVERNMENT_MEMBERSHIP_ROLE_SET,
  GOVERNMENT_STAFF_MANAGEABLE_ROLES,
} from './constants.js'
import { GOVERNMENT_PROGRAM_USER_ROLE } from './governmentSignup.js'

const LISTABLE_GOVERNMENT_ROLES_SQL = `(
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
  '${GOVERNMENT_PROGRAM_USER_ROLE}'
)`

export const GOVERNMENT_ENTITY_STATUSES = Object.freeze(['active', 'blocked', 'inactive'])

const MANAGEABLE_ROLES_INDUSTRY = GOVERNMENT_STAFF_MANAGEABLE_ROLES

const MANAGEABLE_ROLES_AGENCY = Object.freeze(['government_agency_admin', 'government_staff'])

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function isGovernmentUserManager(ctx) {
  if (isGovernmentSuperAdmin(ctx) || isGovernmentIndustryAdmin(ctx)) {
    return true
  }
  return (ctx.governmentAgencyAdminTenantIds?.length ?? 0) > 0
}

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function isGovernmentAgencyAdminOnly(ctx) {
  if (isGovernmentSuperAdmin(ctx) || isGovernmentIndustryAdmin(ctx)) {
    return false
  }
  return (ctx.governmentAgencyAdminTenantIds?.length ?? 0) > 0
}

/**
 * @param {unknown} raw
 */
export function parseGovernmentMembershipRole(raw) {
  const r = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_MEMBERSHIP_ROLE_SET.has(r) ? r : null
}

/**
 * @param {unknown} raw
 */
export function parseGovernmentEntityStatus(raw) {
  const s = String(raw ?? '').trim().toLowerCase()
  return GOVERNMENT_ENTITY_STATUSES.includes(s) ? s : null
}

/**
 * @param {unknown} value
 */
export function toIsoString(value) {
  if (value == null) {
    return null
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    return null
  }
  return d.toISOString()
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export async function resolveGovernmentUserManagerScope(pool, ctx) {
  const industryId = await resolveGovernmentIndustryId(pool)
  if (!industryId) {
    return { ok: false, status: 500, message: 'government 업종이 설정되지 않았습니다.' }
  }
  if (isGovernmentSuperAdmin(ctx) || isGovernmentIndustryAdmin(ctx)) {
    const r = await pool.query(
      `
      SELECT t.id::text AS id
      FROM tenants t
      INNER JOIN industries i ON i.id = t.industry_id
      WHERE LOWER(TRIM(i.code)) = $1
      `,
      [GOVERNMENT_INDUSTRY_CODE],
    )
    return {
      ok: true,
      industryId,
      fullAccess: true,
      tenantIds: r.rows.map((row) => String(row.id)),
      allowedRoles: MANAGEABLE_ROLES_INDUSTRY,
    }
  }
  const tenantIds = [...(ctx.governmentAgencyAdminTenantIds ?? [])]
  if (tenantIds.length === 0) {
    return { ok: false, status: 403, message: '사용자 관리 권한이 없습니다.' }
  }
  return {
    ok: true,
    industryId,
    fullAccess: false,
    tenantIds,
    allowedRoles: MANAGEABLE_ROLES_AGENCY,
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function loadGovernmentUserMembership(pool, userId) {
  const r = await pool.query(
    `
    SELECT
      m.user_id,
      m.role,
      m.scope_type,
      m.scope_id,
      m.tenant_id::text AS tenant_id,
      m.industry_id::text AS industry_id,
      m.status AS membership_status,
      t.name AS tenant_name,
      t.code AS agency_code
    FROM user_memberships m
    INNER JOIN industries i ON i.id = m.industry_id AND LOWER(TRIM(i.code)) = $2
    LEFT JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = $1
      AND m.role IN ${LISTABLE_GOVERNMENT_ROLES_SQL}
    ORDER BY
      CASE m.role
        WHEN 'government_industry_admin' THEN 1
        WHEN 'government_agency_admin' THEN 2
        WHEN 'government_staff' THEN 3
        ELSE 4
      END,
      m.id ASC
    LIMIT 1
    `,
    [userId, GOVERNMENT_INDUSTRY_CODE],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[] }} scope
 * @param {string} userId
 */
export async function assertCanManageGovernmentUser(pool, scope, userId) {
  const uid = String(userId ?? '').trim()
  if (!uid) {
    return { ok: false, status: 400, message: '잘못된 사용자 ID입니다.' }
  }
  const mem = await loadGovernmentUserMembership(pool, uid)
  if (!mem) {
    return { ok: false, status: 404, message: '사용자를 찾을 수 없습니다.' }
  }
  if (scope.fullAccess) {
    return { ok: true, membership: mem }
  }
  const role = String(mem.role ?? '')
  if (role === 'government_industry_admin') {
    return { ok: false, status: 403, message: '해당 사용자를 관리할 권한이 없습니다.' }
  }
  const tid = mem.tenant_id != null ? String(mem.tenant_id) : ''
  if (!tid || !scope.tenantIds.includes(tid)) {
    return { ok: false, status: 403, message: '해당 사용자를 관리할 권한이 없습니다.' }
  }
  return { ok: true, membership: mem }
}

/**
 * @param {string} role
 * @param {string|null} tenantId
 * @param {string} industryId
 */
export function membershipInsertParams(role, tenantId, industryId) {
  if (role === 'government_industry_admin') {
    return {
      role,
      scope_type: 'industry',
      scope_id: String(industryId),
      tenant_id: null,
      industry_id: industryId,
      membership_type: 'admin',
      customer_access: 'tenant',
    }
  }
  const tid = String(tenantId ?? '').trim()
  if (!tid) {
    throw new Error('tenantId가 필요합니다.')
  }
  if (role === 'government_agency_admin') {
    return {
      role,
      scope_type: 'tenant',
      scope_id: tid,
      tenant_id: tid,
      industry_id: industryId,
      membership_type: 'admin',
      customer_access: 'tenant',
    }
  }
  if (role === GOVERNMENT_PROGRAM_USER_ROLE) {
    return {
      role,
      scope_type: 'tenant',
      scope_id: tid,
      tenant_id: tid,
      industry_id: industryId,
      membership_type: 'user',
      customer_access: 'own',
    }
  }
  return {
    role,
    scope_type: 'tenant',
    scope_id: tid,
    tenant_id: tid,
    industry_id: industryId,
    membership_type: 'staff',
    customer_access: 'assigned',
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[], industryId: string, allowedRoles: readonly string[] }} scope
 * @param {{ role?: string, tenantId?: string, status?: string, q?: string }} filters
 */
export async function listGovernmentAdminUsers(pool, scope, filters = {}) {
  const params = [GOVERNMENT_INDUSTRY_CODE]
  const where = [
    `COALESCE(u.is_deleted, false) IS NOT TRUE`,
    `m.role IN ${LISTABLE_GOVERNMENT_ROLES_SQL}`,
    `LOWER(TRIM(i.code)) = $1`,
  ]
  let n = 2

  if (!scope.fullAccess) {
    where.push(`m.role <> 'government_industry_admin'`)
    where.push(`m.tenant_id::text = ANY($${n}::text[])`)
    params.push(scope.tenantIds)
    n += 1
  }

  const roleFilter = parseGovernmentMembershipRole(filters.role)
  if (roleFilter) {
    where.push(`m.role = $${n}`)
    params.push(roleFilter)
    n += 1
  }

  const tenantFilter = filters.tenantId != null ? String(filters.tenantId).trim() : ''
  if (tenantFilter) {
    where.push(`m.tenant_id::text = $${n}`)
    params.push(tenantFilter)
    n += 1
  }

  const statusFilter = parseGovernmentEntityStatus(filters.status)
  if (statusFilter) {
    where.push(`LOWER(TRIM(COALESCE(u.status, 'active'))) = $${n}`)
    params.push(statusFilter)
    n += 1
  }

  const q = String(filters.q ?? '').trim()
  if (q) {
    where.push(`(u.username ILIKE $${n} OR COALESCE(u.display_name, '') ILIKE $${n})`)
    params.push(`%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`)
    n += 1
  }

  const r = await pool.query(
    `
    SELECT *
    FROM (
      SELECT DISTINCT ON (u.id)
        u.id::text AS id,
        u.username,
        COALESCE(u.display_name, '') AS display_name,
        LOWER(TRIM(COALESCE(u.status, 'active'))) AS status,
        u.created_at,
        u.last_login_at,
        m.role AS government_role,
        m.tenant_id::text AS tenant_id,
        t.name AS tenant_name,
        t.code AS agency_code
      FROM users u
      INNER JOIN user_memberships m ON m.user_id = u.id
      INNER JOIN industries i ON i.id = m.industry_id
      LEFT JOIN tenants t ON t.id = m.tenant_id
      WHERE ${where.join(' AND ')}
      ORDER BY u.id,
        CASE m.role
          WHEN 'government_industry_admin' THEN 1
          WHEN 'government_agency_admin' THEN 2
          WHEN 'government_staff' THEN 3
          ELSE 4
        END,
        m.id ASC
    ) ranked
    ORDER BY username ASC
    `,
    params,
  )

  return r.rows.map((row) => ({
    id: String(row.id),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? '').trim(),
    role: String(row.government_role ?? ''),
    tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
    tenantName: row.tenant_name != null ? String(row.tenant_name) : null,
    agencyCode: row.agency_code != null ? String(row.agency_code) : null,
    status: String(row.status ?? 'active'),
    createdAt: toIsoString(row.created_at),
    lastLoginAt: toIsoString(row.last_login_at),
  }))
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} userId
 * @param {string} industryId
 * @param {ReturnType<typeof membershipInsertParams>} spec
 */
export async function replaceGovernmentMembership(db, userId, industryId, spec) {
  await db.query(
    `
    DELETE FROM user_memberships
    WHERE user_id = $1
      AND role IN ${LISTABLE_GOVERNMENT_ROLES_SQL}
    `,
    [userId],
  )
  await db.query(
    `
    INSERT INTO user_memberships (
      user_id, role, scope_type, scope_id, tenant_id, industry_id, status,
      membership_type, customer_access
    )
    VALUES ($1, $2, $3, $4, $5::bigint, $6::bigint, 'active', $7, $8)
    `,
    [
      userId,
      spec.role,
      spec.scope_type,
      spec.scope_id,
      spec.tenant_id,
      spec.industry_id,
      spec.membership_type,
      spec.customer_access,
    ],
  )
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} tenantId
 * @param {string} industryId
 */
export async function assertGovernmentTenantInIndustry(pool, tenantId, industryId) {
  const r = await pool.query(
    `
    SELECT t.id::text AS id, t.name, t.code
    FROM tenants t
    WHERE t.id = $1::bigint AND t.industry_id = $2::bigint
    LIMIT 1
    `,
    [tenantId, industryId],
  )
  return r.rows[0] ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} username
 */
export async function isUsernameTaken(pool, username) {
  const r = await pool.query(
    `
    SELECT 1 FROM users
    WHERE username = $1 AND COALESCE(is_deleted, false) IS NOT TRUE
    LIMIT 1
    `,
    [username],
  )
  return (r.rowCount ?? 0) > 0
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[], industryId: string, allowedRoles: readonly string[] }} scope
 * @param {object} body
 */
export async function createGovernmentAdminUser(pool, scope, body) {
  const username = String(body.username ?? '').trim()
  const password = String(body.password ?? '')
  const displayName = String(body.displayName ?? body.display_name ?? '').trim()
  const role = parseGovernmentMembershipRole(body.role)
  const tenantIdRaw = body.tenantId ?? body.tenant_id ?? body.agencyId ?? body.agency_id
  const tenantId = tenantIdRaw != null ? String(tenantIdRaw).trim() : ''

  if (!username || username.length < 2) {
    return { ok: false, status: 400, message: '아이디는 2자 이상이어야 합니다.' }
  }
  if (password.length < 8) {
    return { ok: false, status: 400, message: '비밀번호는 8자 이상이어야 합니다.' }
  }
  if (!displayName) {
    return { ok: false, status: 400, message: '이름이 필요합니다.' }
  }
  if (!role || !scope.allowedRoles.includes(role)) {
    return { ok: false, status: 400, message: '권한(role)이 올바르지 않습니다.' }
  }
  if (role === GOVERNMENT_PROGRAM_USER_ROLE) {
    return {
      ok: false,
      status: 400,
      message: '이용자 계정은 기관 코드 회원가입으로만 생성할 수 있습니다.',
    }
  }
  if (role !== 'government_industry_admin' && !tenantId) {
    return { ok: false, status: 400, message: '소속 수행기관/대행사(tenantId)가 필요합니다.' }
  }
  if (role === 'government_industry_admin' && !scope.fullAccess) {
    return { ok: false, status: 403, message: '업종 관리자는 상위 관리자만 생성할 수 있습니다.' }
  }
  if (tenantId && !scope.fullAccess && !scope.tenantIds.includes(tenantId)) {
    return { ok: false, status: 403, message: '해당 수행기관에 사용자를 추가할 권한이 없습니다.' }
  }

  if (await isUsernameTaken(pool, username)) {
    return { ok: false, status: 409, message: '이미 사용 중인 아이디입니다.' }
  }

  if (tenantId) {
    const tenant = await assertGovernmentTenantInIndustry(pool, tenantId, scope.industryId)
    if (!tenant) {
      return { ok: false, status: 400, message: '유효하지 않은 수행기관/대행사입니다.' }
    }
  }

  const gaId = await resolveGovernmentCrmGaId(pool)
  if (gaId == null) {
    return { ok: false, status: 500, message: 'government CRM GA가 설정되지 않았습니다.' }
  }

  const userId = randomUUID()
  const hash = await bcrypt.hash(password, 10)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
      INSERT INTO users (id, username, password_hash, role, ga_id, display_name, status, invited_by_user_id)
      VALUES ($1, $2, $3, 'USER', $4, $5, 'active', $1)
      `,
      [userId, username, hash, gaId, displayName],
    )
    const spec = membershipInsertParams(
      role,
      role === 'government_industry_admin' ? null : tenantId,
      scope.industryId,
    )
    await replaceGovernmentMembership(client, userId, scope.industryId, spec)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const rows = await listGovernmentAdminUsers(pool, scope, { q: username })
  const created = rows.find((u) => u.id === userId) ?? rows[0]
  return { ok: true, user: created }
}

function readBootstrapLoginId() {
  return String(process.env.GOVERNMENT_ADMIN_LOGIN_ID ?? 'admin').trim()
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[], industryId: string, allowedRoles: readonly string[] }} scope
 * @param {string} userId
 * @param {object} body
 */
export async function patchGovernmentAdminUser(pool, scope, userId, body) {
  const access = await assertCanManageGovernmentUser(pool, scope, userId)
  if (!access.ok) {
    return access
  }

  const hasDisplay =
    Object.prototype.hasOwnProperty.call(body, 'displayName') ||
    Object.prototype.hasOwnProperty.call(body, 'display_name')
  const hasRole = Object.prototype.hasOwnProperty.call(body, 'role')
  const hasTenant =
    Object.prototype.hasOwnProperty.call(body, 'tenantId') ||
    Object.prototype.hasOwnProperty.call(body, 'tenant_id') ||
    Object.prototype.hasOwnProperty.call(body, 'agencyId')
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status')

  if (!hasDisplay && !hasRole && !hasTenant && !hasStatus) {
    return { ok: false, status: 400, message: '변경할 항목이 없습니다.' }
  }

  const u = await pool.query(
    `SELECT id, username, display_name, status FROM users WHERE id = $1 AND COALESCE(is_deleted, false) IS NOT TRUE`,
    [userId],
  )
  if ((u.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, message: '사용자를 찾을 수 없습니다.' }
  }
  const username = String(u.rows[0].username ?? '').trim()
  if (username === readBootstrapLoginId() && hasStatus) {
    const st = parseGovernmentEntityStatus(body.status)
    if (st && st !== 'active') {
      return { ok: false, status: 403, message: '시스템 관리자 계정의 상태는 변경할 수 없습니다.' }
    }
  }

  const currentRole = access.membership ? String(access.membership.role) : ''
  let nextRole = currentRole || null
  if (hasRole) {
    const parsed = parseGovernmentMembershipRole(body.role)
    if (!parsed || !scope.allowedRoles.includes(parsed)) {
      if (parsed === GOVERNMENT_PROGRAM_USER_ROLE) {
        return {
          ok: false,
          status: 400,
          message: '이용자 권한은 기관 코드 가입으로만 부여됩니다.',
        }
      }
      return { ok: false, status: 400, message: '권한(role)이 올바르지 않습니다.' }
    }
    if (parsed === 'government_industry_admin' && !scope.fullAccess) {
      return { ok: false, status: 403, message: '업종 관리자 권한은 변경할 수 없습니다.' }
    }
    if (
      currentRole === GOVERNMENT_PROGRAM_USER_ROLE &&
      parsed !== GOVERNMENT_PROGRAM_USER_ROLE &&
      !scope.fullAccess
    ) {
      return {
        ok: false,
        status: 403,
        message: '이용자를 직원으로 승격할 수 없습니다. 전체 관리자만 권한 변경이 가능합니다.',
      }
    }
    if (parsed === GOVERNMENT_PROGRAM_USER_ROLE && currentRole !== GOVERNMENT_PROGRAM_USER_ROLE) {
      return {
        ok: false,
        status: 403,
        message: '직원·관리자 계정을 이용자로 변경할 수 없습니다.',
      }
    }
    nextRole = parsed
  }

  let nextTenantId = access.membership?.tenant_id != null ? String(access.membership.tenant_id) : null
  if (hasTenant) {
    const raw = body.tenantId ?? body.tenant_id ?? body.agencyId
    nextTenantId = raw != null ? String(raw).trim() : ''
  }
  if (nextRole && nextRole !== 'government_industry_admin' && !nextTenantId) {
    return { ok: false, status: 400, message: '소속 수행기관/대행사(tenantId)가 필요합니다.' }
  }
  if (nextTenantId && !scope.fullAccess && !scope.tenantIds.includes(nextTenantId)) {
    return { ok: false, status: 403, message: '해당 수행기관으로 변경할 권한이 없습니다.' }
  }
  if (nextTenantId) {
    const tenant = await assertGovernmentTenantInIndustry(pool, nextTenantId, scope.industryId)
    if (!tenant) {
      return { ok: false, status: 400, message: '유효하지 않은 수행기관/대행사입니다.' }
    }
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const parts = []
    const vals = []
    let n = 1
    if (hasDisplay) {
      const dn = String(body.displayName ?? body.display_name ?? '').trim()
      if (!dn) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, message: '이름이 필요합니다.' }
      }
      parts.push(`display_name = $${n++}`)
      vals.push(dn)
    }
    if (hasStatus) {
      const st = parseGovernmentEntityStatus(body.status)
      if (!st) {
        await client.query('ROLLBACK')
        return { ok: false, status: 400, message: 'status는 active, blocked, inactive 중 하나여야 합니다.' }
      }
      parts.push(`status = $${n++}`)
      vals.push(st)
    }
    if (parts.length > 0) {
      vals.push(userId)
      await client.query(`UPDATE users SET ${parts.join(', ')} WHERE id = $${n}`, vals)
    }
    if (hasRole || hasTenant) {
      const spec = membershipInsertParams(
        /** @type {string} */ (nextRole),
        nextRole === 'government_industry_admin' ? null : nextTenantId,
        scope.industryId,
      )
      await replaceGovernmentMembership(client, userId, scope.industryId, spec)
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }

  const rows = await listGovernmentAdminUsers(pool, scope, {})
  const updated = rows.find((row) => row.id === userId)
  return { ok: true, user: updated ?? null }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ fullAccess: boolean, tenantIds: string[] }} scope
 * @param {string} userId
 * @param {object} body
 */
export async function resetGovernmentAdminUserPassword(pool, scope, userId, body) {
  const access = await assertCanManageGovernmentUser(pool, scope, userId)
  if (!access.ok) {
    return access
  }

  const password = String(body.password ?? body.newPassword ?? '').trim()
  if (password.length < 8) {
    return { ok: false, status: 400, message: '비밀번호는 8자 이상이어야 합니다.' }
  }

  const hash = await bcrypt.hash(password, 10)
  const r = await pool.query(
    `
    UPDATE users SET password_hash = $1
    WHERE id = $2 AND COALESCE(is_deleted, false) IS NOT TRUE
    RETURNING id
    `,
    [hash, userId],
  )
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, message: '사용자를 찾을 수 없습니다.' }
  }
  return { ok: true, message: '비밀번호가 변경되었습니다.' }
}
