/**
 * government-support 접근 판별.
 *
 * 보험 CRM 대응:
 * - government_user ≈ 보험 유저 (고객/사업장/신청 데이터 소유)
 * - government_agency_admin ≈ GA 관리자 (직원·운영, 유저 데이터 직접 관리 아님)
 * - government_staff ≈ GA 직원 (공지·전달·운영, 유저 데이터 직접 관리 아님)
 * - government_industry_admin ≈ 플랫폼 운영 (전체 대행사·설정, 유저 데이터 전체 목록 노출 아님)
 *
 * @module governmentAccess
 */

import { createAttachPlatformContext, isPlatformSuperAdmin } from '../platformRbac.js'
import { GOVERNMENT_INDUSTRY_CODE } from './constants.js'
import { isGovernmentUserManager } from './governmentAdminUsers.js'

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function isGovernmentSuperAdmin(ctx) {
  return isPlatformSuperAdmin(ctx)
}

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function isGovernmentIndustryAdmin(ctx) {
  if (isGovernmentSuperAdmin(ctx)) {
    return true
  }
  return (ctx.governmentIndustryAdminIndustryIds?.length ?? 0) > 0
}

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function isGovernmentProgramUser(ctx) {
  return (ctx.governmentProgramUserTenantIds?.length ?? 0) > 0
}

export function isGovernmentTenantMember(ctx) {
  if (isGovernmentIndustryAdmin(ctx)) {
    return true
  }
  return (
    (ctx.governmentAgencyAdminTenantIds?.length ?? 0) > 0 ||
    (ctx.governmentStaffTenantIds?.length ?? 0) > 0 ||
    isGovernmentProgramUser(ctx)
  )
}

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string|null|undefined} tenantId
 */
export function canAccessGovernmentTenant(ctx, tenantId) {
  const tid = tenantId != null ? String(tenantId).trim() : ''
  if (!tid) {
    return false
  }
  if (isGovernmentSuperAdmin(ctx) || isGovernmentIndustryAdmin(ctx)) {
    return true
  }
  const admin = ctx.governmentAgencyAdminTenantIds ?? []
  const staff = ctx.governmentStaffTenantIds ?? []
  const programUsers = ctx.governmentProgramUserTenantIds ?? []
  return admin.includes(tid) || staff.includes(tid) || programUsers.includes(tid)
}

/**
 * 사업장/고객 목록 API — 프로그램 이용자 본인만.
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function canListGovernmentProfiles(ctx) {
  return isGovernmentProgramUser(ctx)
}

/**
 * 사업장/고객 생성 — 프로그램 이용자만.
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export function canCreateGovernmentProfile(ctx) {
  return isGovernmentProgramUser(ctx)
}

/**
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {{ owner_user_id?: string|null, ownerUserId?: string|null, tenant_id?: string|number|null, tenantId?: string|number|null }} profileRow
 */
export function canAccessGovernmentProfile(ctx, profileRow) {
  const tenantId =
    profileRow?.tenant_id != null
      ? String(profileRow.tenant_id)
      : profileRow?.tenantId != null
        ? String(profileRow.tenantId)
        : ''
  if (!tenantId || !canAccessGovernmentTenant(ctx, tenantId)) {
    return false
  }
  const ownerId = profileRow?.owner_user_id ?? profileRow?.ownerUserId ?? null
  if (ownerId == null || String(ownerId).trim() === '') {
    return false
  }
  if (isGovernmentProgramUser(ctx)) {
    return String(ownerId) === String(ctx.userId)
  }
  // assignment 테이블 도입 전: staff·관리자는 사업장/고객 원본 데이터 접근 불가
  return false
}

/**
 * @param {import('pg').Pool} pool
 * @returns {Promise<string|null>} industries.id for government
 */
export async function resolveGovernmentIndustryId(pool) {
  const r = await pool.query(
    `SELECT id::text AS id FROM industries WHERE LOWER(TRIM(code)) = $1 LIMIT 1`,
    [GOVERNMENT_INDUSTRY_CODE],
  )
  const id = r.rows[0]?.id
  return id != null ? String(id).trim() : null
}

/**
 * tenant 가 government 업종인지.
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string|number} tenantId
 */
export async function isGovernmentSupportTenant(pool, tenantId) {
  const tid = String(tenantId ?? '').trim()
  if (!tid) {
    return false
  }
  const r = await pool.query(
    `
    SELECT 1
    FROM tenants t
    INNER JOIN industries i ON i.id = t.industry_id
    WHERE t.id = $1::bigint AND LOWER(TRIM(i.code)) = $2
    LIMIT 1
    `,
    [tid, GOVERNMENT_INDUSTRY_CODE],
  )
  return (r.rowCount ?? 0) > 0
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @returns {Promise<{ ok: true, tenantIds: string[] } | { ok: false, status: number, message: string }>}
 */
/**
 * @param {import('pg').Pool | { query: Function }} pool
 * @returns {Promise<number|null>}
 */
export async function resolveGovernmentCrmGaId(pool) {
  const r = await pool.query(
    `SELECT id FROM ga_companies WHERE LOWER(TRIM(code)) = 'government_crm' LIMIT 1`,
  )
  const id = r.rows[0]?.id
  return id != null && Number(id) > 0 ? Number(id) : null
}

/**
 * 업종 관리자가 고객/사업장을 만들 때 사용할 기본 tenant (수행기관 0건일 때 1회 생성).
 * @param {import('pg').Pool | { query: Function }} pool
 * @returns {Promise<string>}
 */
export async function ensureDefaultGovernmentWorkspaceTenant(pool) {
  const industryId = await resolveGovernmentIndustryId(pool)
  if (!industryId) {
    throw new Error('government 업종이 설정되지 않았습니다.')
  }
  const gaId = await resolveGovernmentCrmGaId(pool)
  const platformCode = 'GOVERNMENT_PLATFORM'
  const existing = await pool.query(
    `
    SELECT id::text AS id
    FROM tenants
    WHERE industry_id = $1::bigint AND LOWER(TRIM(code)) = $2
    LIMIT 1
    `,
    [industryId, platformCode],
  )
  if (existing.rows[0]?.id) {
    return String(existing.rows[0].id)
  }
  const ins = await pool.query(
    `
    INSERT INTO tenants (industry_id, code, name, status, legacy_ga_id, config)
    VALUES ($1::bigint, $2, $3, 'active', $4, '{}'::jsonb)
    RETURNING id::text AS id
    `,
    [industryId, platformCode, '정부지원 플랫폼', gaId],
  )
  const id = ins.rows[0]?.id
  if (!id) {
    throw new Error('기본 수행 tenant 생성에 실패했습니다.')
  }
  return String(id)
}

/**
 * 워크스페이스에서 프로필 생성 시 사용할 tenant id (요청 tenant 없으면 scope 첫 항목·플랫폼 tenant).
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string|null|undefined} requestedTenantId
 */
export async function resolveTenantIdForProfileCreate(pool, ctx, requestedTenantId) {
  if (!canCreateGovernmentProfile(ctx)) {
    return {
      ok: false,
      status: 403,
      message: '사업장/고객은 기관 코드로 가입한 이용자만 등록할 수 있습니다.',
    }
  }
  const tid = requestedTenantId != null ? String(requestedTenantId).trim() : ''
  if (tid && canAccessGovernmentTenant(ctx, tid)) {
    const ok = await isGovernmentSupportTenant(pool, tid)
    if (ok) {
      return { ok: true, tenantId: tid }
    }
  }
  const scope = await resolveGovernmentTenantScopeForQuery(pool, ctx)
  if (!scope.ok) {
    return { ok: false, status: scope.status, message: scope.message }
  }
  const programTenants = ctx.governmentProgramUserTenantIds ?? []
  if (programTenants.length > 0) {
    return { ok: true, tenantId: programTenants[0] }
  }
  return {
    ok: false,
    status: 400,
    message: '소속 수행기관이 없습니다. 관리자에게 문의하세요.',
  }
}

export async function resolveGovernmentTenantScopeForQuery(pool, ctx) {
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
    return { ok: true, tenantIds: r.rows.map((row) => String(row.id)) }
  }
  const ids = new Set([
    ...(ctx.governmentAgencyAdminTenantIds ?? []),
    ...(ctx.governmentStaffTenantIds ?? []),
    ...(ctx.governmentProgramUserTenantIds ?? []),
  ])
  if (ids.size === 0) {
    return { ok: false, status: 403, message: 'government-support 접근 권한이 없습니다.' }
  }
  return { ok: true, tenantIds: [...ids] }
}

/**
 * 프로필 목록/단건 조회용 스코프 (이용자는 본인 owner_user_id 만).
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 */
export async function resolveGovernmentProfileQueryScope(pool, ctx) {
  if (!canListGovernmentProfiles(ctx)) {
    return { ok: true, tenantIds: [], ownerUserId: null }
  }
  const scope = await resolveGovernmentTenantScopeForQuery(pool, ctx)
  if (!scope.ok) {
    return scope
  }
  const programTenants = (ctx.governmentProgramUserTenantIds ?? []).map(String)
  const tenantIds = scope.tenantIds.filter((id) => programTenants.includes(String(id)))
  return {
    ok: true,
    tenantIds,
    ownerUserId: String(ctx.userId),
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ requireAuth: Function, handleDbError: Function }} deps
 */
export function createGovernmentSupportGuards(pool, deps) {
  const { requireAuth, handleDbError } = deps
  const attach = createAttachPlatformContext(pool)

  const requireGovernmentMember = [
    requireAuth,
    attach,
    (req, res, next) => {
      try {
        const ctx = /** @type {import('express').Request & { platformContext?: object }} */ (req)
          .platformContext
        if (!ctx || !isGovernmentTenantMember(ctx)) {
          res.status(403).json({ message: 'government-support 접근 권한이 없습니다.' })
          return
        }
        next()
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  ]

  const requireGovernmentIndustryAdmin = [
    requireAuth,
    attach,
    (req, res, next) => {
      try {
        const ctx = /** @type {import('express').Request & { platformContext?: object }} */ (req)
          .platformContext
        if (!ctx || !isGovernmentIndustryAdmin(ctx)) {
          res.status(403).json({ message: 'government 업종 관리자 권한이 필요합니다.' })
          return
        }
        next()
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  ]

  const requireGovernmentUserManager = [
    requireAuth,
    attach,
    (req, res, next) => {
      try {
        const ctx = /** @type {import('express').Request & { platformContext?: object }} */ (req)
          .platformContext
        if (!ctx || !isGovernmentUserManager(ctx)) {
          res.status(403).json({ message: '사용자 관리 권한이 없습니다.' })
          return
        }
        next()
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  ]

  return {
    requireGovernmentMember,
    requireGovernmentIndustryAdmin,
    requireGovernmentUserManager,
    attach,
  }
}
