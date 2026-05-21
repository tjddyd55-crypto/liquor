/**
 * CRM-Platform RBAC — user_memberships 중심 헬퍼.
 * - `createAttachPlatformContext` 는 **requireAuth 다음** 신규 라우트에만 붙일 것(전역 적용 금지).
 * - JWT·requireAuth 자체는 이 모듈이 수정하지 않는다.
 * @module platformRbac
 */

import { resolveMembershipsForUser } from './crmPlatformMeta.js'
import { isSuperAdminRole } from './rbacScope.js'

/** 플랫폼 멤버십 역할(스네이크, DB user_memberships.role 과 정합). */
const CANONICAL_PLATFORM_ROLES = Object.freeze([
  'super_admin',
  'industry_admin',
  'tenant_admin',
  'staff',
  'user',
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
  'government_user',
])

const CANONICAL_SET = new Set(CANONICAL_PLATFORM_ROLES)

/**
 * @typedef {Object} UserLike
 * @property {string} id
 * @property {unknown} [role] users.role JWT/req.user 근사
 */

/**
 * @typedef {Object} UserMembershipRow
 * DB `user_memberships` SELECT * 행 shape.
 * @property {string|number|bigint} [id]
 * @property {string} user_id
 * @property {string} role
 * @property {string} scope_type
 * @property {string|null} [scope_id]
 * @property {string|number|bigint|null} [tenant_id]
 * @property {string|number|bigint|null} [industry_id]
 * @property {string} [status]
 */

/**
 * @typedef {Object} EffectivePlatformContext
 * @property {string} userId
 * @property {string} legacyRole
 * @property {boolean} isSuperAdmin
 * @property {readonly UserMembershipRow[]} memberships
 * @property {readonly string[]} industryAdminIndustryIds
 * @property {readonly string[]} tenantAdminTenantIds
 * @property {readonly string[]} staffTenantIds
 * @property {readonly string[]} userTenantIds
 * @property {readonly string[]} governmentIndustryAdminIndustryIds
 * @property {readonly string[]} governmentAgencyAdminTenantIds
 * @property {readonly string[]} governmentStaffTenantIds
 * @property {readonly string[]} governmentProgramUserTenantIds
 */

/**
 * requireAuth 통과 후 `createAttachPlatformContext` 가 `platformContext` 를 채운다.
 * @typedef {import('express').Request & { platformContext?: EffectivePlatformContext }} RequestWithOptionalPlatformContext
 */

/**
 * 플랫폼 멤버십 role 문자열을 정규화한다.
 * @param {unknown} role
 * @returns {typeof CANONICAL_PLATFORM_ROLES[number] | null} 알 수 없으면 null
 */
export function normalizePlatformRole(role) {
  const s = String(role ?? '')
    .trim()
    .toLowerCase()
  if (!s) {
    return null
  }
  if (CANONICAL_SET.has(s)) {
    return /** @type {typeof CANONICAL_PLATFORM_ROLES[number]} */ (s)
  }
  return null
}

/**
 * @param {unknown} id
 * @returns {string|null}
 */
function normalizeIdKey(id) {
  if (id === undefined || id === null) {
    return null
  }
  const s = String(id).trim()
  return s === '' ? null : s
}

/**
 * 활성 멤버십만 로드(resolveMembershipsForUser 재사용).
 * @param {import('pg').Pool | { query: Function }} pool
 * @param {string | null | undefined} userId
 * @returns {Promise<UserMembershipRow[]>}
 */
export async function loadActiveMembershipsForUser(pool, userId) {
  const uid = userId != null ? String(userId).trim() : ''
  if (!uid) {
    return []
  }
  /** @type {UserMembershipRow[]} */
  const rows = await resolveMembershipsForUser(pool, uid)
  return rows ?? []
}

/**
 * 멤버십 배열과 레거시 유저 정보로 플랫폼 컨텍스트를 만든다.
 * @param {{ user: UserLike, memberships: UserMembershipRow[] }} args
 * @returns {EffectivePlatformContext}
 */
export function buildEffectivePlatformContext({ user, memberships }) {
  const userId = user?.id != null ? String(user.id).trim() : ''
  const legacyRole =
    typeof user?.role === 'string' ? user.role.trim() : String(user?.role ?? '').trim()

  /** @type {Set<string>} */
  const industryAdmin = new Set()
  /** @type {Set<string>} */
  const tenantAdmin = new Set()
  /** @type {Set<string>} */
  const staffTenants = new Set()
  /** @type {Set<string>} */
  const userTenants = new Set()
  /** @type {Set<string>} */
  const governmentIndustryAdmin = new Set()
  /** @type {Set<string>} */
  const governmentAgencyAdmin = new Set()
  /** @type {Set<string>} */
  const governmentStaff = new Set()
  /** @type {Set<string>} */
  const governmentProgramUsers = new Set()

  let membershipSuperAdmin = false

  const list = Array.isArray(memberships) ? memberships : []
  for (const m of list) {
    const pr = normalizePlatformRole(m.role)
    const scopeType = String(m.scope_type ?? '').trim().toLowerCase()

    if (pr === 'super_admin' && scopeType === 'platform') {
      membershipSuperAdmin = true
      continue
    }

    if (pr === 'industry_admin' && scopeType === 'industry') {
      const iid =
        normalizeIdKey(m.industry_id) ??
        normalizeIdKey(m.scope_id)
      if (iid !== null) {
        industryAdmin.add(iid)
      }
      continue
    }

    if (pr === 'tenant_admin' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        tenantAdmin.add(tid)
      }
      continue
    }

    if (pr === 'staff' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        staffTenants.add(tid)
      }
      continue
    }

    if (pr === 'user' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        userTenants.add(tid)
      }
      continue
    }

    if (pr === 'government_industry_admin' && scopeType === 'industry') {
      const iid =
        normalizeIdKey(m.industry_id) ??
        normalizeIdKey(m.scope_id)
      if (iid !== null) {
        governmentIndustryAdmin.add(iid)
      }
      continue
    }

    if (pr === 'government_agency_admin' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        governmentAgencyAdmin.add(tid)
      }
      continue
    }

    if (pr === 'government_staff' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        governmentStaff.add(tid)
      }
      continue
    }

    if (pr === 'government_user' && scopeType === 'tenant') {
      const tid =
        normalizeIdKey(m.tenant_id) ??
        normalizeIdKey(m.scope_id)
      if (tid !== null) {
        governmentProgramUsers.add(tid)
      }
    }
  }

  const legacySuper = legacyRole !== '' && isSuperAdminRole(legacyRole)

  /** @type {EffectivePlatformContext} */
  const context = Object.freeze({
    userId,
    legacyRole,
    isSuperAdmin: legacySuper || membershipSuperAdmin,
    memberships: Object.freeze(list.map((row) => Object.freeze({ ...row }))),
    industryAdminIndustryIds: Object.freeze([...industryAdmin].sort()),
    tenantAdminTenantIds: Object.freeze([...tenantAdmin].sort()),
    staffTenantIds: Object.freeze([...staffTenants].sort()),
    userTenantIds: Object.freeze([...userTenants].sort()),
    governmentIndustryAdminIndustryIds: Object.freeze([...governmentIndustryAdmin].sort()),
    governmentAgencyAdminTenantIds: Object.freeze([...governmentAgencyAdmin].sort()),
    governmentStaffTenantIds: Object.freeze([...governmentStaff].sort()),
    governmentProgramUserTenantIds: Object.freeze([...governmentProgramUsers].sort()),
  })

  return context
}

/**
 * 활성 멤버십 중 해당 플랫폼 역할 문자열이 하나라도 있는지.
 * @param {EffectivePlatformContext} context
 * @param {unknown} role
 */
export function hasPlatformRole(context, role) {
  const want = normalizePlatformRole(role)
  if (!want) {
    return false
  }
  if (want === 'super_admin' && isPlatformSuperAdmin(context)) {
    return true
  }
  for (const m of context.memberships) {
    if (normalizePlatformRole(m.role) === want) {
      return true
    }
  }
  return false
}

/**
 * @param {EffectivePlatformContext} context
 */
export function isPlatformSuperAdmin(context) {
  return context.isSuperAdmin === true
}

/**
 * 업종 단위 관리자 또는 플랫폼 슈퍼관리자 여부.
 * @param {EffectivePlatformContext} context
 * @param {unknown} industryId
 */
export function hasIndustryAdminScope(context, industryId) {
  if (isPlatformSuperAdmin(context)) {
    return true
  }
  const key = normalizeIdKey(industryId)
  if (key === null) {
    return false
  }
  return context.industryAdminIndustryIds.includes(key)
}

/**
 * 테넌트 단위 관리자 또는 플랫폼 슈퍼관리자 여부.
 * @param {EffectivePlatformContext} context
 * @param {unknown} tenantId
 */
export function hasTenantAdminScope(context, tenantId) {
  if (isPlatformSuperAdmin(context)) {
    return true
  }
  const key = normalizeIdKey(tenantId)
  if (key === null) {
    return false
  }
  return context.tenantAdminTenantIds.includes(key)
}

/**
 * `attachPlatformContext` 이후 채워진 값을 반환한다. 없으면 `undefined`.
 * @param {RequestWithOptionalPlatformContext} req
 * @returns {EffectivePlatformContext | undefined}
 */
export function getPlatformContext(req) {
  return req.platformContext
}

/**
 * 핸들러 내부에서 컨텍스트가 반드시 있을 때 사용. 미들웨어 누락 시 Error.
 * Express 응답으로 변환하지 않는다 — 호출부에서 try/catch 또는 정책에 맞게 처리.
 * @param {RequestWithOptionalPlatformContext} req
 * @returns {EffectivePlatformContext}
 */
export function requirePlatformContext(req) {
  const c = req.platformContext
  if (!c) {
    throw new Error('[platformRbac] requirePlatformContext: run createAttachPlatformContext middleware after requireAuth')
  }
  return c
}

/** `requirePlatformContext` 와 동일. */
export function ensurePlatformContext(req) {
  return requirePlatformContext(req)
}

/**
 * requireAuth 다음에 두고 `req.platformContext` 를 채운다.
 *
 * 정책:
 * - `req.user` 가 없거나 `req.user.id` 가 비어 있으면 **`401`** JSON `{ message }` 후 종료(오용 방지).
 * - 멤버십 로드 실패 시 **`next(err)`** — 상위에서 Express 오류 처리기로 넘김.
 *
 * @param {import('pg').Pool | { query: Function }} pool
 * @returns {import('express').RequestHandler}
 */
export function createAttachPlatformContext(pool) {
  if (pool == null || typeof pool.query !== 'function') {
    throw new Error('[platformRbac] createAttachPlatformContext: pool.query 가 필요합니다')
  }

  /**
   * @type {import('express').RequestHandler}
   */
  async function attachPlatformContextMiddleware(req, res, next) {
    /** @type {RequestWithOptionalPlatformContext} */
    const r = req
    const u = r.user
    if (
      !u ||
      u.id === undefined ||
      u.id === null ||
      String(u.id).trim() === ''
    ) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    try {
      const memberships = await loadActiveMembershipsForUser(pool, u.id)
      r.platformContext = buildEffectivePlatformContext({ user: u, memberships })
      next()
    } catch (e) {
      next(e)
    }
  }

  return attachPlatformContextMiddleware
}

/** `createAttachPlatformContext` 의 별칭(동일 반환 RequestHandler). */
export const attachPlatformContext = createAttachPlatformContext

/**
 * `forbiddenResponse`(index.js) 와 동일한 JSON 형태로 맞춘다. (순환 import 회피)
 * @param {import('express').Response} res
 * @param {string} [message]
 */
function sendForbidden(res, message = '권한이 없습니다.') {
  res.status(403).json({
    error: 'FORBIDDEN',
    message,
  })
}

/**
 * @param {import('express').Response} res
 * @param {string} message
 */
function sendPlatformContextMissing(res, message) {
  res.status(500).json({ message })
}

/**
 * @param {RequestWithOptionalPlatformContext} req
 * @param {import('express').Response} res
 * @returns {EffectivePlatformContext | null} 없으면 res 전송 후 null
 */
function readPlatformContextOrFail(req, res) {
  const ctx = req.platformContext
  if (!ctx) {
    sendPlatformContextMissing(
      res,
      '플랫폼 권한 컨텍스트가 설정되지 않았습니다. requireAuth와 attachPlatformContext 순서를 확인하세요.',
    )
    return null
  }
  return ctx
}

/**
 * requireAuth + attachPlatformContext 이후.
 * `isPlatformSuperAdmin(context)` 가 false 이면 403.
 * @returns {import('express').RequestHandler}
 */
export function createRequirePlatformSuperAdmin() {
  return function requirePlatformSuperAdmin(req, res, next) {
    /** @type {RequestWithOptionalPlatformContext} */
    const r = req
    const ctx = readPlatformContextOrFail(r, res)
    if (!ctx) {
      return
    }
    if (!isPlatformSuperAdmin(ctx)) {
      sendForbidden(res)
      return
    }
    next()
  }
}

/**
 * @typedef {Object} RequireIndustryAdminOptions
 * @property {string} [industryIdParam] `req.params` 키 (기본 `industryId`)
 * @property {string} [industryIdBodyKey] `req.body` 키 (기본 `industryId`)
 */

/**
 * requireAuth + attachPlatformContext 이후.
 * - Super Admin: 통과
 * - `hasIndustryAdminScope`: 통과
 * - industryId는 `req.params[industryIdParam]` 우선, 없으면 `req.body[industryIdBodyKey]`
 * @param {RequireIndustryAdminOptions} [options]
 * @returns {import('express').RequestHandler}
 */
export function createRequireIndustryAdmin(options = {}) {
  const paramKey = options.industryIdParam ?? 'industryId'
  const bodyKey = options.industryIdBodyKey ?? 'industryId'

  return function requireIndustryAdmin(req, res, next) {
    /** @type {RequestWithOptionalPlatformContext} */
    const r = req
    const ctx = readPlatformContextOrFail(r, res)
    if (!ctx) {
      return
    }

    const fromParams = r.params?.[paramKey]
    const fromBody = r.body?.[bodyKey]
    const raw = fromParams !== undefined && fromParams !== null && String(fromParams).trim() !== ''
      ? fromParams
      : fromBody

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      res.status(400).json({ message: 'industryId가 필요합니다.' })
      return
    }

    if (!hasIndustryAdminScope(ctx, raw)) {
      sendForbidden(res)
      return
    }
    next()
  }
}

/**
 * @typedef {Object} RequireTenantAdminOptions
 * @property {string} [tenantIdParam] `req.params` 키 (기본 `tenantId`)
 * @property {string} [tenantIdBodyKey] `req.body` 키 (기본 `tenantId`)
 */

/**
 * requireAuth + attachPlatformContext 이후.
 * - Super Admin: 통과
 * - `hasTenantAdminScope`: 통과
 * - tenantId는 `req.params[tenantIdParam]` 우선, 없으면 `req.body[tenantIdBodyKey]`
 * @param {RequireTenantAdminOptions} [options]
 * @returns {import('express').RequestHandler}
 */
export function createRequireTenantAdmin(options = {}) {
  const paramKey = options.tenantIdParam ?? 'tenantId'
  const bodyKey = options.tenantIdBodyKey ?? 'tenantId'

  return function requireTenantAdmin(req, res, next) {
    /** @type {RequestWithOptionalPlatformContext} */
    const r = req
    const ctx = readPlatformContextOrFail(r, res)
    if (!ctx) {
      return
    }

    const fromParams = r.params?.[paramKey]
    const fromBody = r.body?.[bodyKey]
    const raw = fromParams !== undefined && fromParams !== null && String(fromParams).trim() !== ''
      ? fromParams
      : fromBody

    if (raw === undefined || raw === null || String(raw).trim() === '') {
      res.status(400).json({ message: 'tenantId가 필요합니다.' })
      return
    }

    if (!hasTenantAdminScope(ctx, raw)) {
      sendForbidden(res)
      return
    }
    next()
  }
}

/**
 * URL `tenantId` — 양의 정수 (parse only; DB 조회는 미들웨어에서).
 * @param {unknown} raw
 * @returns {number | null}
 */
function parsePositiveTenantIdParamForManage(raw) {
  if (raw === undefined || raw === null) {
    return null
  }
  const s = String(raw).trim()
  if (!/^[1-9]\d*$/.test(s)) {
    return null
  }
  const n = Number(s)
  if (!Number.isSafeInteger(n) || n < 1) {
    return null
  }
  return n
}

/**
 * requireAuth + attachPlatformContext 이후.
 * Tenant Admin 목록·지정 API 전용 — **개별 테넌트 관리자(tenant_admin) 가드 아님.**
 *
 * 동작 요약:
 * - `tenantId`(params) 검증 후 `tenants` 조회 · 활성 검사
 * - Super Admin 또는 해당 tenant 의 `industry_id` 에 대해 Industry Admin 스코프인 경우 통과
 * - 성공 시 `req.platformTenantAdminManage = { tenantId, industryId }` 설정 (핸들러 재사용)
 *
 * @param {import('pg').Pool | { query: Function }} pool
 * @returns {import('express').RequestHandler}
 */
export function createRequireTenantAdminManager(pool) {
  if (pool == null || typeof pool.query !== 'function') {
    throw new Error('[platformRbac] createRequireTenantAdminManager: pool.query 가 필요합니다')
  }

  /** @typedef {RequestWithOptionalPlatformContext & { platformTenantAdminManage?: { tenantId: number; industryId: number }}} RequestWithTenantAdminManage */

  /** @type {import('express').RequestHandler} */
  async function requireTenantAdminManage(req, res, next) {
    const ctx = readPlatformContextOrFail(req, res)
    if (!ctx) {
      return
    }

    /** @type {RequestWithTenantAdminManage} */
    const r = req
    delete r.platformTenantAdminManage

    const tenantIdParsed = parsePositiveTenantIdParamForManage(req.params?.tenantId)
    if (tenantIdParsed == null) {
      res.status(400).json({ message: '유효한 tenantId 가 필요합니다.' })
      return
    }

    try {
      const { rows } = await pool.query(
        `SELECT id, industry_id, status FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantIdParsed],
      )
      const row = rows[0]
      if (!row) {
        res.status(404).json({ message: '해당 테넌트를 찾을 수 없습니다.' })
        return
      }
      const st = String(row.status ?? '').trim().toLowerCase()
      if (st !== 'active') {
        res.status(400).json({ message: '활성 상태의 테넌트만 관리할 수 있습니다.' })
        return
      }
      const industryRaw = row.industry_id
      const industryId =
        typeof industryRaw === 'bigint'
          ? Number(industryRaw)
          : typeof industryRaw === 'number'
            ? industryRaw
            : Number(industryRaw)

      const tidRaw = row.id
      const tenantIdStable =
        typeof tidRaw === 'bigint'
          ? Number(tidRaw)
          : typeof tidRaw === 'number'
            ? tidRaw
            : Number(tidRaw)

      if (!Number.isSafeInteger(industryId) || industryId < 1) {
        res.status(500).json({ message: '테넌트 업종 정보가 올바르지 않습니다.' })
        return
      }

      if (!Number.isSafeInteger(tenantIdStable) || tenantIdStable < 1) {
        res.status(400).json({ message: '유효한 tenantId 가 필요합니다.' })
        return
      }

      if (!isPlatformSuperAdmin(ctx)) {
        if (!hasIndustryAdminScope(ctx, industryId)) {
          sendForbidden(res)
          return
        }
      }

      r.platformTenantAdminManage = { tenantId: tenantIdStable, industryId }
      next()
    } catch (e) {
      next(e)
    }
  }

  return requireTenantAdminManage
}

/**
 * Staff/User 테넌트 멤버십 API 전용 가드(requireAuth + attachPlatformContext 이후).
 *
 * 통과 조건(Super 또는 해당 테넌트 업종의 Industry Admin 또는 해당 테넌트의 Tenant Admin):
 * - `tenantId`(params) 양의 정수, `tenants` 존재·활성
 * - 성공 시 `req.platformTenantMemberManage = { tenantId, industryId }`
 *
 * 참고: `createRequireTenantAdminManager` 는 tenant_admin 지정만 허용(Super 또는 Industry Admin)한다.
 * @param {import('pg').Pool | { query: Function }} pool
 * @returns {import('express').RequestHandler}
 */
export function createRequireTenantMemberManager(pool) {
  if (pool == null || typeof pool.query !== 'function') {
    throw new Error('[platformRbac] createRequireTenantMemberManager: pool.query 가 필요합니다')
  }

  /** @typedef {RequestWithOptionalPlatformContext & { platformTenantMemberManage?: { tenantId: number; industryId: number }}} RequestWithTenantMemberManage */

  /** @type {import('express').RequestHandler} */
  async function requireTenantMemberManage(req, res, next) {
    const ctx = readPlatformContextOrFail(req, res)
    if (!ctx) {
      return
    }

    /** @type {RequestWithTenantMemberManage} */
    const r = req
    delete r.platformTenantMemberManage

    const tenantIdParsed = parsePositiveTenantIdParamForManage(req.params?.tenantId)
    if (tenantIdParsed == null) {
      res.status(400).json({ message: '유효한 tenantId 가 필요합니다.' })
      return
    }

    try {
      const { rows } = await pool.query(
        `SELECT id, industry_id, status FROM tenants WHERE id = $1 LIMIT 1`,
        [tenantIdParsed],
      )
      const row = rows[0]
      if (!row) {
        res.status(404).json({ message: '해당 테넌트를 찾을 수 없습니다.' })
        return
      }
      const st = String(row.status ?? '').trim().toLowerCase()
      if (st !== 'active') {
        res.status(400).json({ message: '활성 상태의 테넌트만 관리할 수 있습니다.' })
        return
      }
      const industryRaw = row.industry_id
      const industryId =
        typeof industryRaw === 'bigint'
          ? Number(industryRaw)
          : typeof industryRaw === 'number'
            ? industryRaw
            : Number(industryRaw)

      const tidRaw = row.id
      const tenantIdStable =
        typeof tidRaw === 'bigint'
          ? Number(tidRaw)
          : typeof tidRaw === 'number'
            ? tidRaw
            : Number(tidRaw)

      if (!Number.isSafeInteger(industryId) || industryId < 1) {
        res.status(500).json({ message: '테넌트 업종 정보가 올바르지 않습니다.' })
        return
      }

      if (!Number.isSafeInteger(tenantIdStable) || tenantIdStable < 1) {
        res.status(400).json({ message: '유효한 tenantId 가 필요합니다.' })
        return
      }

      if (!isPlatformSuperAdmin(ctx)) {
        const industryOk = hasIndustryAdminScope(ctx, industryId)
        const tenantOk = hasTenantAdminScope(ctx, tenantIdStable)
        if (!(industryOk || tenantOk)) {
          sendForbidden(res)
          return
        }
      }

      r.platformTenantMemberManage = { tenantId: tenantIdStable, industryId }
      next()
    } catch (e) {
      next(e)
    }
  }

  return requireTenantMemberManage
}

/*
 * ─── 미연결 ─────────────────────────────────────────────
 * 위 가드는 신규 Industry/Tenant 관리 라우트에만 `[requireAuth, attach, …]` 순으로 장착.
 * server/index.js 전역 또는 registerPlatformAdminApi 일괄 적용 금지.
 */
