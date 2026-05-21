/**
 * CRM-Platform 메타 API (SUPER_ADMIN / platform 컨텍스트).
 * — industries 조회(GET)는 레거시 requireSuperAdmin
 * — industry 생성(POST)는 platform 컨텍스트 기반 플랫폼 슈퍼관리자 가드
 * — industries/:id/admins 조회·지정은 platform 컨텍스트 + 플랫폼 슈퍼
 * — industries/:id/tenants 목록(GET)은 platform 컨텍스트 + 업종관리자(또는 플랫폼 슈퍼); 업종 활성 필수
 * — industries/:id/tenants 생성(POST)은 platform 컨텍스트 + 업종관리자(또는 플랫폼 슈퍼)
 * — industries/:id/tenants/:id/seat-billing 수정(PATCH)은 platform 컨텍스트 + 업종관리자(또는 플랫폼 슈퍼) — 좌석·라이선스 정책·청구 메타
 * — tenants/:id/admins 조회·지정은 platform 컨텍스트 + 슈퍼 또는 해당 테넌트 소속 Industry Admin
 * — tenants/:id/members 조회(GET)·staff|user 지정(POST)은 platform 컨텍스트 + 슈퍼 또는 Industry Admin(해당 테넌트) 또는 Tenant Admin(해당 테넌트)
 * — tenants 목록(GET 전체)·`/tenants/:tenantId`(GET 단일)·memberships/외부요약 등은 조회 전용 · 민감 필드 미포함
 * — tenants/:tenantId/users 조회(GET)·생성(POST)·수정(PATCH)·상태 PATCH(/users/:userId/status) — 멤버 매니저 가드
 * — tenants/:tenantId/registration-codes 조회(GET)·생성(POST)·수정(PATCH inactive·maxUses·expiresAt 등) — MVP 일반(agent/own/user) 코드만 생성
 * — users/search(GET)은 platform 컨텍스트 + 플랫폼 슈퍼관리자 전용(username·표시 이름 부분 검색)
 * — me/access(GET)은 requireAuth + attachPlatformContext 만 — 본인 모드 진입 가능 요약(멤버십 raw 미포함)
 */

import {
  createAttachPlatformContext,
  createRequireIndustryAdmin,
  createRequirePlatformSuperAdmin,
  createRequireTenantAdminManager,
  createRequireTenantMemberManager,
} from './lib/platformRbac.js'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { normalizeTenantRegistrationCodeRaw } from './lib/tenantRegistrationCodes.js'
import { parseGaId } from './lib/parseGaId.js'
import { logSecurityEvent } from './lib/securityAudit.js'
import { normalizeRbacRole } from './lib/rbacScope.js'
import {
  assertSeatAvailableForNewActivation,
  billingEntitlementFromInput,
  computeRemainingSeats,
  countActiveTenantSeatMemberships,
  mergeLicensePolicyForPatch,
  parseLicensePolicyFromRow,
  parseSeatLimitColumn,
  parseSeatLimitForApiPatch,
} from './lib/tenantSeatPolicy.js'

const INDUSTRY_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/

const INDUSTRY_STATUS_VALUES = /** @type {const} */ (['active', 'inactive'])

/** tenant.status — industries 와 동일 허용값 */
const TENANT_STATUS_VALUES = INDUSTRY_STATUS_VALUES

/** 시드·운영 보호용 (신규 생성 금지) */
const RESERVED_TENANT_CODE = 'yjasset'

const MAX_CONFIG_JSON_LENGTH = 10_000

const PLATFORM_USER_SEARCH_DEFAULT_LIMIT = 20

/** @typedef {'platform' | 'industry' | 'tenant' | 'work'} PlatformAccessMode */

/** @type {readonly PlatformAccessMode[]} */
const PLATFORM_ACCESS_DEFAULT_MODE_PRIORITY = Object.freeze([
  'platform',
  'industry',
  'tenant',
  'work',
])

/**
 * 레거시 users.role 기준으로 기존 GA/업무 앱(고객관리 등) 화면에 들어갈 수 있는 역할인지.
 * `normalizeRbacRole` 과 서버 rbacScope 의 VALID_USER_ROLES 와 정합.
 * @param {unknown} legacyRole
 */
function legacyRoleAllowsWorkMode(legacyRole) {
  const n = normalizeRbacRole(legacyRole)
  switch (n) {
    case 'SUPER_ADMIN':
    case 'GA_ADMIN':
    case 'GA_STAFF':
    case 'USER':
    case 'INSURER_MANAGER':
    case 'LOSS_ADJUSTER':
      return true
    default:
      return false
  }
}

/**
 * staff · user 테넌트 id 목록 통합(문자열 id, 오름차순, 중복 제거).
 * @param {readonly string[]} staffTenantIds
 * @param {readonly string[]} userTenantIds
 */
function mergeWorkTenantIds(staffTenantIds, userTenantIds) {
  const merged = new Set([...staffTenantIds, ...userTenantIds])
  return [...merged].sort()
}

/**
 * @param {readonly PlatformAccessMode[]} modes
 * @returns {PlatformAccessMode | null}
 */
function pickPlatformAccessDefaultMode(modes) {
  for (const step of PLATFORM_ACCESS_DEFAULT_MODE_PRIORITY) {
    if (modes.includes(step)) {
      return step
    }
  }
  return null
}

/**
 * @param {unknown} reqUserId `req.user.id` (JWT와 동일 식별)
 * @param {{
 *   userId: string
 *   isSuperAdmin: boolean
 *   industryAdminIndustryIds: readonly string[]
 *   tenantAdminTenantIds: readonly string[]
 *   staffTenantIds: readonly string[]
 *   userTenantIds: readonly string[]
 * }} ctx
 * @param {unknown} reqUserLegacyRole
 */
function buildPlatformAccessSummaryPayload(reqUserId, ctx, reqUserLegacyRole) {
  if (!ctx) {
    throw new Error('[platform-admin] platformContext required for access summary')
  }

  const industryAdminIndustryIds = [...ctx.industryAdminIndustryIds]
  const tenantAdminTenantIds = [...ctx.tenantAdminTenantIds]
  const staffTenantIds = [...ctx.staffTenantIds]
  const userTenantIds = [...ctx.userTenantIds]
  const workTenantIds = mergeWorkTenantIds(staffTenantIds, userTenantIds)

  /** @type {PlatformAccessMode[]} */
  const availableModes = []
  if (ctx.isSuperAdmin === true) {
    availableModes.push('platform')
  }
  if (industryAdminIndustryIds.length > 0) {
    availableModes.push('industry')
  }
  if (tenantAdminTenantIds.length > 0) {
    availableModes.push('tenant')
  }
  if (workTenantIds.length > 0 || legacyRoleAllowsWorkMode(reqUserLegacyRole)) {
    availableModes.push('work')
  }

  return {
    userId:
      reqUserId === undefined || reqUserId === null
        ? ''
        : String(reqUserId).trim(),
    legacyRole:
      typeof reqUserLegacyRole === 'string'
        ? reqUserLegacyRole.trim()
        : String(reqUserLegacyRole ?? '').trim(),
    isSuperAdmin: ctx.isSuperAdmin === true,
    availableModes,
    defaultMode: pickPlatformAccessDefaultMode(availableModes),
    industryAdminIndustryIds,
    tenantAdminTenantIds,
    staffTenantIds,
    userTenantIds,
    workTenantIds,
  }
}

const PLATFORM_USER_SEARCH_MAX_LIMIT = 50

/**
 * ILIKE 에 넣는 사용자 문자열 내 `%`, `_`, `\` 보호(admin/subscriptions/users 와 동일 규약).
 * @param {string} segment
 */
function escapeILikeUserSegment(segment) {
  return segment.replace(/[\\%_]/g, '\\$&')
}

/**
 * @param {unknown} rawQ
 * @param {unknown} rawLimit
 * @returns
 *   | { ok: true, q: string, ilikePattern: string, limit: number }
 *   | { ok: false, status: number, message: string }}
 */
function parsePlatformUserSearchQuery(rawQ, rawLimit) {
  if (rawQ === undefined || rawQ === null) {
    return { ok: false, status: 400, message: 'q가 필요합니다.' }
  }
  if (Array.isArray(rawQ)) {
    return { ok: false, status: 400, message: 'q는 단일 문자열이어야 합니다.' }
  }
  if (typeof rawQ !== 'string') {
    return { ok: false, status: 400, message: 'q는 문자열이어야 합니다.' }
  }
  const q = rawQ.trim()
  if (q.length < 2) {
    return { ok: false, status: 400, message: 'q는 2자 이상이어야 합니다.' }
  }

  let limit = PLATFORM_USER_SEARCH_DEFAULT_LIMIT
  if (rawLimit !== undefined && rawLimit !== null && String(rawLimit).trim() !== '') {
    if (Array.isArray(rawLimit)) {
      return { ok: false, status: 400, message: 'limit은 단일 값이어야 합니다.' }
    }
    const limRaw = typeof rawLimit === 'string' ? rawLimit.trim() : String(rawLimit)
    const limNum = Number(limRaw)
    if (!Number.isSafeInteger(limNum) || limNum < 1) {
      return { ok: false, status: 400, message: 'limit은 양의 정수여야 합니다.' }
    }
    if (limNum > PLATFORM_USER_SEARCH_MAX_LIMIT) {
      return {
        ok: false,
        status: 400,
        message: `limit은 최대 ${PLATFORM_USER_SEARCH_MAX_LIMIT}까지 허용됩니다.`,
      }
    }
    limit = limNum
  }

  const ilikePattern = `%${escapeILikeUserSegment(q)}%`
  return { ok: true, q, ilikePattern, limit }
}

/**
 * @param {unknown} v
 * @returns {v is Record<string, unknown>}
 */
function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    return false
  }
  const p = Object.getPrototypeOf(v)
  return p === Object.prototype || p === null
}

/**
 * @param {unknown} body
 * @returns
 *   | { ok: true, payload: { code: string, name: string, status: string, config: Record<string, unknown> } }
 *   | { ok: false, status: number, message: string }}
 */
function parseIndustryCreateInput(body) {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? body : {}

  if (raw.code === undefined || raw.code === null) {
    return { ok: false, status: 400, message: 'code가 필요합니다.' }
  }
  if (typeof raw.code !== 'string') {
    return { ok: false, status: 400, message: 'code는 문자열이어야 합니다.' }
  }
  const code = raw.code.trim().toLowerCase()
  if (!code) {
    return { ok: false, status: 400, message: 'code가 필요합니다.' }
  }
  if (!INDUSTRY_CODE_PATTERN.test(code)) {
    return { ok: false, status: 400, message: 'code 형식이 올바르지 않습니다.' }
  }

  if (raw.name === undefined || raw.name === null) {
    return { ok: false, status: 400, message: 'name이 필요합니다.' }
  }
  if (typeof raw.name !== 'string') {
    return { ok: false, status: 400, message: 'name은 문자열이어야 합니다.' }
  }
  const name = raw.name.trim()
  if (name.length < 1) {
    return { ok: false, status: 400, message: 'name이 필요합니다.' }
  }
  if (name.length > 200) {
    return { ok: false, status: 400, message: 'name은 200자 이하여야 합니다.' }
  }

  /** @type {string} */
  let status
  if (
    raw.status === undefined ||
    raw.status === null ||
    String(raw.status).trim() === ''
  ) {
    status = 'active'
  } else {
    if (typeof raw.status !== 'string') {
      return { ok: false, status: 400, message: 'status는 문자열이어야 합니다.' }
    }
    status = raw.status.trim().toLowerCase()
    if (!INDUSTRY_STATUS_VALUES.includes(/** @type {'active' | 'inactive'} */ (status))) {
      return { ok: false, status: 400, message: 'status는 active 또는 inactive 여야 합니다.' }
    }
  }

  /** @type {Record<string, unknown>} */
  let config
  if (raw.config === undefined) {
    config = {}
  } else if (raw.config === null) {
    return { ok: false, status: 400, message: 'config는 plain object 여야 합니다.' }
  } else if (!isPlainObject(raw.config)) {
    return { ok: false, status: 400, message: 'config는 plain object 여야 합니다.' }
  } else {
    config = /** @type {Record<string, unknown>} */ (raw.config)
  }

  return { ok: true, payload: { code, name, status, config } }
}

/**
 * @param {unknown} body
 * @returns
 *   | {
 *       ok: true
 *       payload: {
 *         code: string
 *         name: string
 *         status: string
 *         legacyGaId: number | null
 *         config: Record<string, unknown>
 *       }
 *     }
 *   | { ok: false, status: number, message: string }}
 */
function parseTenantCreateInput(body) {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? body : {}

  if (raw.code === undefined || raw.code === null) {
    return { ok: false, status: 400, message: 'code가 필요합니다.' }
  }
  if (typeof raw.code !== 'string') {
    return { ok: false, status: 400, message: 'code는 문자열이어야 합니다.' }
  }
  const code = raw.code.trim().toLowerCase()
  if (!code) {
    return { ok: false, status: 400, message: 'code가 필요합니다.' }
  }
  if (!INDUSTRY_CODE_PATTERN.test(code)) {
    return { ok: false, status: 400, message: 'code 형식이 올바르지 않습니다.' }
  }
  if (code === RESERVED_TENANT_CODE) {
    return { ok: false, status: 400, message: '예약된 테넌트 코드입니다.' }
  }

  if (raw.name === undefined || raw.name === null) {
    return { ok: false, status: 400, message: 'name이 필요합니다.' }
  }
  if (typeof raw.name !== 'string') {
    return { ok: false, status: 400, message: 'name은 문자열이어야 합니다.' }
  }
  const name = raw.name.trim()
  if (name.length < 1) {
    return { ok: false, status: 400, message: 'name이 필요합니다.' }
  }
  if (name.length > 200) {
    return { ok: false, status: 400, message: 'name은 200자 이하여야 합니다.' }
  }

  /** @type {string} */
  let status
  if (
    raw.status === undefined ||
    raw.status === null ||
    String(raw.status).trim() === ''
  ) {
    status = 'active'
  } else {
    if (typeof raw.status !== 'string') {
      return { ok: false, status: 400, message: 'status는 문자열이어야 합니다.' }
    }
    status = raw.status.trim().toLowerCase()
    if (!TENANT_STATUS_VALUES.includes(/** @type {'active' | 'inactive'} */ (status))) {
      return { ok: false, status: 400, message: 'status는 active 또는 inactive 여야 합니다.' }
    }
  }

  /** @type {number | null} */
  let legacyGaId = null
  if (raw.legacyGaId !== undefined && raw.legacyGaId !== null) {
    if (typeof raw.legacyGaId === 'number') {
      if (!Number.isInteger(raw.legacyGaId) || raw.legacyGaId < 1) {
        return { ok: false, status: 400, message: 'legacyGaId는 양의 정수여야 합니다.' }
      }
      legacyGaId = raw.legacyGaId
    } else if (
      typeof raw.legacyGaId === 'string' &&
      /^[1-9]\d*$/.test(raw.legacyGaId.trim())
    ) {
      legacyGaId = Number(raw.legacyGaId.trim())
    } else {
      return { ok: false, status: 400, message: 'legacyGaId는 양의 정수여야 합니다.' }
    }
  }

  /** @type {Record<string, unknown>} */
  let config
  if (raw.config === undefined) {
    config = {}
  } else if (raw.config === null) {
    return { ok: false, status: 400, message: 'config는 plain object 여야 합니다.' }
  } else if (!isPlainObject(raw.config)) {
    return { ok: false, status: 400, message: 'config는 plain object 여야 합니다.' }
  } else {
    config = /** @type {Record<string, unknown>} */ (raw.config)
  }

  return { ok: true, payload: { code, name, status, legacyGaId, config } }
}

/**
 * DB 기록용 R2 프리픽스 템플릿 ({environment} 는 리터럴, 런타임 치환 없음).
 * @param {string} industryCode
 * @param {string} tenantCode
 */
function buildTenantR2KeyPrefixTemplate(industryCode, tenantCode) {
  const ic = String(industryCode ?? '').trim()
  return `crm-platform/{environment}/${ic}/tenants/${tenantCode}`
}

function toIso(v) {
  if (v == null) {
    return null
  }
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * `industryId` URL param — 양의 정수 문자열만 허용 (앞뒤 공백 허용 후 검사).
 * @param {unknown} raw
 * @returns {number | null}
 */
function parsePositiveIndustryIdParam(raw) {
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
 * `tenantId` URL param — industryId 와 동일 규칙(양의 정수).
 * @param {unknown} raw
 * @returns {number | null}
 */
function parsePositiveTenantIdParam(raw) {
  return parsePositiveIndustryIdParam(raw)
}

/**
 * 테넌트 행 + 활성 좌석 수 → 플랫폼 관리자 API 응답(좌석·정책·청구 메타 포함).
 * @param {object} row
 * @param {number} activeSeatCount
 */
function mapIndustryTenantRowExtended(row, activeSeatCount) {
  const lim = parseSeatLimitColumn(row.seat_limit)
  const lp = parseLicensePolicyFromRow(row.license_policy)
  const ent =
    row.billing_entitlement != null &&
    typeof row.billing_entitlement === 'object' &&
    !Array.isArray(row.billing_entitlement)
      ? /** @type {Record<string, unknown>} */ (row.billing_entitlement)
      : {}
  return {
    id: String(row.id),
    industryId: row.industry_id != null ? String(row.industry_id) : null,
    industryCode: row.industry_code != null ? String(row.industry_code) : null,
    code: row.code,
    name: row.name,
    status: row.status,
    legacyGaId: row.legacy_ga_id != null ? Number(row.legacy_ga_id) : null,
    crmCustomerTemplateId:
      row.crm_customer_template_id != null && row.crm_customer_template_id !== ''
        ? Number(row.crm_customer_template_id)
        : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    seatLimit: lim,
    activeSeatCount,
    remainingSeats: computeRemainingSeats(lim, activeSeatCount),
    licensePolicy: {
      maxConcurrentSessionsPerUser: lp.maxConcurrentSessionsPerUser,
      maxRegisteredDevicesPerUser: lp.maxRegisteredDevicesPerUser,
    },
    billingEntitlement: ent,
  }
}

/**
 * @param {object} row
 */
function mapTenantAdminMemberItem(row) {
  return {
    membershipId: String(row.membership_id),
    userId: String(row.user_id),
    username: String(row.username ?? ''),
    legacyRole: String(row.legacy_role ?? ''),
    membershipRole: String(row.membership_role ?? ''),
    scopeType: String(row.scope_type ?? ''),
    scopeId: row.scope_id != null ? String(row.scope_id) : '',
    tenantId: row.tenant_id != null ? String(row.tenant_id) : '',
    industryId: row.industry_id != null ? String(row.industry_id) : '',
    status: String(row.status ?? ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

/**
 * @param {object} row
 * @param {'created' | 'already_active' | 'reactivated'} result
 */
function mapTenantAdminAssignResponse(row, result) {
  return {
    ...mapTenantAdminMemberItem(row),
    result,
  }
}

/**
 * `membershipRole` GET 쿼리 필터(staff | user 선택).
 * @param {unknown} raw
 * @returns
 *   | { ok: true, filter: null | 'staff' | 'user' }
 *   | { ok: false, status: number; message: string }}
 */
function parseMembershipRoleQueryFilter(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return { ok: true, filter: null }
  }
  if (Array.isArray(raw)) {
    return { ok: false, status: 400, message: 'membershipRole은 단일 값이어야 합니다.' }
  }
  const v = String(raw).trim().toLowerCase()
  if (v === 'staff' || v === 'user') {
    return { ok: true, filter: v }
  }
  return { ok: false, status: 400, message: 'membershipRole은 staff 또는 user 만 허용합니다.' }
}

/**
 * POST staff|user 테넌트 멤버 지정 입력.
 * @param {unknown} body
 * @returns
 *   | { ok: true; userId: string; membershipRole: 'staff' | 'user' }
 *   | { ok: false; status: number; message: string }}
 */
function parseTenantMemberAssignBody(body) {
  const raw = body && typeof body === 'object' && !Array.isArray(body) ? body : {}
  const rawUserId = raw.userId
  if (rawUserId === undefined || rawUserId === null) {
    return { ok: false, status: 400, message: 'userId가 필요합니다.' }
  }
  if (typeof rawUserId !== 'string') {
    return { ok: false, status: 400, message: 'userId는 문자열이어야 합니다.' }
  }
  const userId = rawUserId.trim()
  if (userId === '') {
    return { ok: false, status: 400, message: 'userId가 필요합니다.' }
  }

  const rawRole = raw.membershipRole
  if (rawRole === undefined || rawRole === null) {
    return { ok: false, status: 400, message: 'membershipRole이 필요합니다.' }
  }
  if (typeof rawRole !== 'string') {
    return { ok: false, status: 400, message: 'membershipRole은 문자열이어야 합니다.' }
  }
  const mr = rawRole.trim().toLowerCase()
  if (mr !== 'staff' && mr !== 'user') {
    return { ok: false, status: 400, message: 'membershipRole은 staff 또는 user 만 허용합니다.' }
  }
  return { ok: true, userId, membershipRole: mr }
}

function mapTenantRegistrationCodeRow(row) {
  return {
    id: String(row.id),
    code: String(row.code ?? ''),
    tenantId: String(row.tenant_id ?? ''),
    industryCode: String(row.industry_code ?? ''),
    defaultMembershipType: String(row.default_membership_type ?? ''),
    defaultCustomerAccess: String(row.default_customer_access ?? ''),
    defaultRole: String(row.default_role ?? ''),
    status: String(row.status ?? ''),
    expiresAt: toIso(row.expires_at),
    maxUses: row.max_uses == null ? null : Number(row.max_uses),
    usedCount: Number(row.used_count ?? 0) || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

/** staff | user 멤버 목록·지정 응답 행 매핑. */
function mapTenantStaffUserMemberItem(row) {
  return {
    membershipId: String(row.membership_id),
    userId: String(row.user_id),
    username: String(row.username ?? ''),
    displayName: String(row.display_name ?? '').trim(),
    legacyRole: String(row.legacy_role ?? ''),
    userAccountStatus: String(row.user_account_status ?? ''),
    lastLoginAt: toIso(row.last_login_at),
    lastLoginIp: row.last_login_ip != null ? String(row.last_login_ip) : null,
    activeSessionCount: Number(row.active_session_count ?? 0) || 0,
    registeredDeviceCount: Number(row.registered_device_count ?? 0) || 0,
    membershipRole: String(row.membership_role ?? ''),
    scopeType: String(row.scope_type ?? ''),
    scopeId: row.scope_id != null ? String(row.scope_id) : '',
    tenantId: row.tenant_id != null ? String(row.tenant_id) : '',
    industryId: row.industry_id != null ? String(row.industry_id) : '',
    status: String(row.status ?? ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    membershipType: String(row.membership_type ?? ''),
    customerAccess: String(row.customer_access ?? ''),
    phoneNumber: row.phone_number != null ? String(row.phone_number ?? '') : '',
  }
}

/**
 * @param {object} row
 * @param {'created' | 'already_active' | 'reactivated'} result
 */
function mapTenantStaffUserAssignResponse(row, result) {
  return {
    ...mapTenantStaffUserMemberItem(row),
    result,
  }
}

/**
 * Tenant 범위 staff/user 멤버십 — UNIQUE 충돌 후 재조회.
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} tenantId
 * @param {number} industryId
 * @param {string} userId
 * @param {'staff' | 'user'} membershipRole
 */
async function selectTenantStaffUserMembershipForUser(
  exec,
  tenantId,
  industryId,
  userId,
  membershipRole,
) {
  const scopeIdStr = String(tenantId)
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.display_name,
      u.role AS legacy_role,
      LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
      u.last_login_at,
      u.last_login_ip,
      (
        SELECT COUNT(*)::int
        FROM user_auth_sessions s
        WHERE s.user_id = u.id
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
      ) AS active_session_count,
      (
        SELECT COUNT(*)::int
        FROM user_registered_devices d
        WHERE d.user_id = u.id
          AND d.revoked_at IS NULL
      ) AS registered_device_count,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.tenant_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.user_id = $1
      AND m.role = $2
      AND m.scope_type = 'tenant'
      AND COALESCE(m.scope_id, '') = $3
      AND m.tenant_id IS NOT DISTINCT FROM $4
      AND m.industry_id IS NOT DISTINCT FROM $5
    `,
    [userId, membershipRole, scopeIdStr, tenantId, industryId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} membershipId
 */
async function selectTenantStaffUserMembershipById(exec, membershipId) {
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.display_name,
      u.role AS legacy_role,
      LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
      u.last_login_at,
      u.last_login_ip,
      (
        SELECT COUNT(*)::int
        FROM user_auth_sessions s
        WHERE s.user_id = u.id
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
      ) AS active_session_count,
      (
        SELECT COUNT(*)::int
        FROM user_registered_devices d
        WHERE d.user_id = u.id
          AND d.revoked_at IS NULL
      ) AS registered_device_count,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.tenant_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.id = $1
      AND m.scope_type = 'tenant'
      AND m.role IN ('staff', 'user')
    `,
    [membershipId],
  )
  return rows[0] ?? null
}

/**
 * tenant_admin 멤버십 — 지정·recover 조회.
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} tenantId
 * @param {number} industryId
 * @param {string} userId
 */
async function selectTenantAdminMembershipForUser(exec, tenantId, industryId, userId) {
  const scopeIdStr = String(tenantId)
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.role AS legacy_role,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.tenant_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.user_id = $1
      AND m.role = 'tenant_admin'
      AND m.scope_type = 'tenant'
      AND COALESCE(m.scope_id, '') = $2
      AND m.tenant_id IS NOT DISTINCT FROM $3
      AND m.industry_id IS NOT DISTINCT FROM $4
    `,
    [userId, scopeIdStr, tenantId, industryId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} membershipId
 */
async function selectTenantAdminMembershipById(exec, membershipId) {
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.role AS legacy_role,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.tenant_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.id = $1
    `,
    [membershipId],
  )
  return rows[0] ?? null
}

/**
 * @param {object} row
 */
function mapIndustryAdminMemberItem(row) {
  return {
    membershipId: String(row.membership_id),
    userId: String(row.user_id),
    username: String(row.username ?? ''),
    legacyRole: String(row.legacy_role ?? ''),
    membershipRole: String(row.membership_role ?? ''),
    scopeType: String(row.scope_type ?? ''),
    scopeId: row.scope_id != null ? String(row.scope_id) : '',
    industryId: row.industry_id != null ? String(row.industry_id) : '',
    status: String(row.status ?? ''),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

/**
 * @param {object} row
 * @param {'created' | 'already_active' | 'reactivated'} result
 */
function mapIndustryAdminAssignResponse(row, result) {
  return {
    ...mapIndustryAdminMemberItem(row),
    result,
  }
}

/**
 * 단일 industry_admin membership 행 + 사용자 (지정/조회 공용).
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} industryId
 * @param {string} userId
 * @returns {Promise<object | null>}
 */
async function selectIndustryAdminMembershipForUser(exec, industryId, userId) {
  const scopeIdStr = String(industryId)
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.role AS legacy_role,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.user_id = $1
      AND m.role = 'industry_admin'
      AND m.scope_type = 'industry'
      AND COALESCE(m.scope_id, '') = $2
      AND m.industry_id = $3
    `,
    [userId, scopeIdStr, industryId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} exec
 * @param {number} membershipId
 */
async function selectIndustryAdminMembershipById(exec, membershipId) {
  const { rows } = await exec.query(
    `
    SELECT
      m.id AS membership_id,
      m.user_id,
      u.username,
      u.role AS legacy_role,
      m.role AS membership_role,
      m.scope_type,
      m.scope_id,
      m.industry_id,
      m.status,
      m.created_at,
      m.updated_at
    FROM user_memberships m
    INNER JOIN users u ON u.id = m.user_id
    WHERE m.id = $1
    `,
    [membershipId],
  )
  return rows[0] ?? null
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, requireSuperAdmin: import('express').RequestHandler, handleDbError: (e: unknown, req: import('express').Request, res: import('express').Response) => void }} deps
 */
export function registerPlatformAdminApi(apiRouter, deps) {
  const { pool, requireAuth, requireSuperAdmin, handleDbError } = deps
  const guard = [requireAuth, requireSuperAdmin]

  apiRouter.get('/admin/platform/industries', ...guard, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, code, name, status, created_at, updated_at
        FROM industries
        ORDER BY id ASC
      `)
      res.json({
        items: rows.map((row) => ({
          id: String(row.id),
          code: row.code,
          name: row.name,
          status: row.status,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  const attachPlatformContext = createAttachPlatformContext(pool)
  const platformAccessSummaryGuard = [requireAuth, attachPlatformContext]

  apiRouter.get('/admin/platform/me/access', ...platformAccessSummaryGuard, async (req, res) => {
    try {
      const ctx = /** @type {import('express').Request & { platformContext?: object }} */ (req)
        .platformContext
      const payload = buildPlatformAccessSummaryPayload(
        req.user?.id,
        /** @type {{ userId: string, isSuperAdmin: boolean, industryAdminIndustryIds: readonly string[], tenantAdminTenantIds: readonly string[], staffTenantIds: readonly string[], userTenantIds: readonly string[] }} */ (
          ctx
        ),
        req.user?.role,
      )
      res.json(payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  const requirePlatformSuperAdmin = createRequirePlatformSuperAdmin()
  const requireIndustryAdminForIndustryRoute = createRequireIndustryAdmin({
    industryIdParam: 'industryId',
  })
  const platformSuperCreateGuard = [
    requireAuth,
    attachPlatformContext,
    requirePlatformSuperAdmin,
  ]
  const platformIndustryTenantCreateGuard = [
    requireAuth,
    attachPlatformContext,
    requireIndustryAdminForIndustryRoute,
  ]
  const requireTenantAdminManage = createRequireTenantAdminManager(pool)
  const platformTenantAdminManagerGuard = [
    requireAuth,
    attachPlatformContext,
    requireTenantAdminManage,
  ]
  const requireTenantMemberManage = createRequireTenantMemberManager(pool)
  const platformTenantMemberManagerGuard = [
    requireAuth,
    attachPlatformContext,
    requireTenantMemberManage,
  ]

  apiRouter.get(
    '/admin/platform/users/search',
    ...platformSuperCreateGuard,
    async (req, res) => {
      try {
        const parsed = parsePlatformUserSearchQuery(req.query.q, req.query.limit)
        if (!parsed.ok) {
          res.status(parsed.status).json({ message: parsed.message })
          return
        }
        const { q, ilikePattern, limit } = parsed

        const { rows } = await pool.query(
          `
          SELECT
            u.id,
            u.username,
            u.display_name,
            u.role,
            u.status,
            u.ga_id,
            g.name AS ga_company_name
          FROM users u
          LEFT JOIN ga_companies g
            ON g.id = u.ga_id
            AND COALESCE(g.is_deleted, FALSE) IS NOT TRUE
          WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
            AND (
              u.username ILIKE $1 OR u.display_name ILIKE $1
            )
          ORDER BY
            CASE WHEN LOWER(TRIM(u.username)) = LOWER($2::text) THEN 0 ELSE 1 END,
            u.username ASC,
            u.id ASC
          LIMIT $3
          `,
          [ilikePattern, q, limit],
        )

        res.json({
          items: rows.map((row) => ({
            id: String(row.id),
            username: row.username,
            displayName: String(row.display_name ?? '').trim(),
            role: normalizeRbacRole(row.role),
            status: String(row.status ?? '').trim().toLowerCase(),
            gaId: row.ga_id != null ? Number(row.ga_id) : null,
            gaCompanyName: row.ga_company_name != null ? String(row.ga_company_name) : null,
          })),
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/industries',
    ...platformSuperCreateGuard,
    async (req, res) => {
      const parsed = parseIndustryCreateInput(req.body)
      if (!parsed.ok) {
        res.status(parsed.status).json({ message: parsed.message })
        return
      }

      const { code, name, status, config } = parsed.payload

      /** @type {string} */
      let configSerialized
      try {
        configSerialized = JSON.stringify(config)
      } catch {
        res.status(400).json({ message: 'config를 직렬화할 수 없습니다.' })
        return
      }
      if (configSerialized.length > MAX_CONFIG_JSON_LENGTH) {
        res
          .status(400)
          .json({ message: 'config JSON 크기는 10000자 이하여야 합니다.' })
        return
      }

      try {
        const { rows } = await pool.query(
          `
          INSERT INTO industries (code, name, status, config)
          VALUES ($1, $2, $3, $4::jsonb)
          RETURNING id, code, name, status, config, created_at, updated_at
          `,
          [code, name, status, configSerialized],
        )
        const row = rows[0]
        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_INDUSTRY_CREATE',
          targetType: 'industry',
          targetId: String(row.id),
          meta: { code: row.code, name: row.name },
        })

        /** @type {Record<string, unknown>} */
        const configOut =
          row.config !== null &&
          typeof row.config === 'object' &&
          !Array.isArray(row.config)
            ? /** @type {Record<string, unknown>} */ (row.config)
            : {}

        res.status(201).json({
          id: String(row.id),
          code: row.code,
          name: row.name,
          status: row.status,
          config: configOut,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        })
      } catch (e) {
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          /** @type {{ code?: string }} */ (e).code === '23505'
        ) {
          res.status(409).json({ message: '이미 존재하는 업종 코드입니다.' })
          return
        }
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get(
    '/admin/platform/industries/:industryId/admins',
    ...platformSuperCreateGuard,
    async (req, res) => {
      try {
        const industryIdParsed = parsePositiveIndustryIdParam(req.params.industryId)
        if (industryIdParsed == null) {
          res.status(400).json({ message: '유효한 industryId 가 필요합니다.' })
          return
        }
        const scopeIdStr = String(industryIdParsed)

        const exists = await pool.query(`SELECT id FROM industries WHERE id = $1 LIMIT 1`, [
          industryIdParsed,
        ])
        if ((exists.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '해당 업종을 찾을 수 없습니다.' })
          return
        }

        const { rows } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.role AS legacy_role,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.industry_id,
            m.status,
            m.created_at,
            m.updated_at
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE m.industry_id = $1
            AND m.role = 'industry_admin'
            AND m.scope_type = 'industry'
            AND COALESCE(m.scope_id, '') = $2
            AND m.status = 'active'
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
          ORDER BY m.id ASC
          `,
          [industryIdParsed, scopeIdStr],
        )

        res.json({
          items: rows.map((row) => mapIndustryAdminMemberItem(row)),
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/industries/:industryId/admins',
    ...platformSuperCreateGuard,
    async (req, res) => {
      const industryIdParsed = parsePositiveIndustryIdParam(req.params.industryId)
      if (industryIdParsed == null) {
        res.status(400).json({ message: '유효한 industryId 가 필요합니다.' })
        return
      }
      const body = req.body
      const rawUserId = body?.userId
      if (rawUserId === undefined || rawUserId === null) {
        res.status(400).json({ message: 'userId가 필요합니다.' })
        return
      }
      if (typeof rawUserId !== 'string') {
        res.status(400).json({ message: 'userId는 문자열이어야 합니다.' })
        return
      }
      const userIdTrim = rawUserId.trim()
      if (userIdTrim === '') {
        res.status(400).json({ message: 'userId가 필요합니다.' })
        return
      }

      const scopeIdStr = String(industryIdParsed)

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const existsInd = await client.query(`SELECT id FROM industries WHERE id = $1 LIMIT 1`, [
          industryIdParsed,
        ])
        if ((existsInd.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ message: '해당 업종을 찾을 수 없습니다.' })
          return
        }

        const userCheck = await client.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
            AND COALESCE(is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(status::text, ''))) = 'active'
          LIMIT 1
          `,
          [userIdTrim],
        )
        if ((userCheck.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({
            message: '사용자를 찾을 수 없거나 활성 상태가 아닙니다.',
          })
          return
        }

        const existing = await client.query(
          `
          SELECT id AS membership_id, status
          FROM user_memberships
          WHERE user_id = $1
            AND role = 'industry_admin'
            AND scope_type = 'industry'
            AND COALESCE(scope_id, '') = $2
            AND industry_id = $3
          FOR UPDATE
          `,
          [userIdTrim, scopeIdStr, industryIdParsed],
        )

        if ((existing.rowCount ?? 0) > 0) {
          /** @type {{ membership_id?: unknown; status?: unknown }} */
          const ex = existing.rows[0]
          const mid = Number(ex.membership_id)
          const stRaw = String(ex.status ?? '').trim().toLowerCase()

          if (stRaw === 'active') {
            const fullActive = await selectIndustryAdminMembershipById(client, mid)
            await client.query('COMMIT')
            if (fullActive != null) {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_INDUSTRY_ADMIN_ASSIGN',
                targetType: 'user_membership',
                targetId: String(mid),
                meta: {
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(mapIndustryAdminAssignResponse(fullActive, 'already_active'))
            } else {
              handleDbError(new Error('[platform-admin] stale membership'), req, res)
            }
            return
          }

          await client.query(
            `
            UPDATE user_memberships
            SET status = 'active',
                updated_at = NOW()
            WHERE id = $1
            `,
            [mid],
          )
          const reactivatedRow = await selectIndustryAdminMembershipById(client, mid)
          await client.query('COMMIT')
          if (reactivatedRow != null) {
            await logSecurityEvent(pool, {
              actorUserId: String(req.user?.id ?? ''),
              actorRole: String(req.user?.role ?? ''),
              action: 'PLATFORM_INDUSTRY_ADMIN_ASSIGN',
              targetType: 'user_membership',
              targetId: String(mid),
              meta: {
                industryId: industryIdParsed,
                userId: userIdTrim,
                result: 'reactivated',
              },
            })
            res
              .status(200)
              .json(mapIndustryAdminAssignResponse(reactivatedRow, 'reactivated'))
          } else {
            handleDbError(new Error('[platform-admin] reactivate inconsistent'), req, res)
          }
          return
        }

        /** @type {unknown} */
        let insertErr = null
        try {
          const insRes = await client.query(
            `
            INSERT INTO user_memberships (
              user_id,
              role,
              scope_type,
              scope_id,
              industry_id,
              tenant_id,
              status
            )
            VALUES ($1, 'industry_admin', 'industry', $2, $3, NULL, 'active')
            RETURNING id
            `,
            [userIdTrim, scopeIdStr, industryIdParsed],
          )
          const newIdRaw = insRes.rows[0]?.id
          const newId = typeof newIdRaw === 'bigint' ? Number(newIdRaw) : Number(newIdRaw)
          const createdRow = await selectIndustryAdminMembershipById(client, newId)
          if (createdRow == null) {
            throw new Error('[platform-admin] insert inconsistent')
          }
          await client.query('COMMIT')
          await logSecurityEvent(pool, {
            actorUserId: String(req.user?.id ?? ''),
            actorRole: String(req.user?.role ?? ''),
            action: 'PLATFORM_INDUSTRY_ADMIN_ASSIGN',
            targetType: 'user_membership',
            targetId: String(newId),
            meta: {
              industryId: industryIdParsed,
              userId: userIdTrim,
              result: 'created',
            },
          })
          res.status(201).json(mapIndustryAdminAssignResponse(createdRow, 'created'))
        } catch (ie) {
          if (
            ie &&
            typeof ie === 'object' &&
            'code' in ie &&
            /** @type {{ code?: string }} */ (ie).code === '23505'
          ) {
            await client.query('ROLLBACK')
            /** @type {unknown} */
            const recovered = await selectIndustryAdminMembershipForUser(
              pool,
              industryIdParsed,
              userIdTrim,
            )
            const recSt =
              recovered != null ? String(recovered.status ?? '').trim().toLowerCase() : ''
            if (recovered != null && recSt === 'active') {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_INDUSTRY_ADMIN_ASSIGN',
                targetType: 'user_membership',
                targetId: String(recovered.membership_id),
                meta: {
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(
                  mapIndustryAdminAssignResponse(
                    /** @type {object} */ (recovered),
                    'already_active',
                  ),
                )
            } else {
              res.status(409).json({ message: '멤버십이 충돌했습니다.' })
            }
            return
          }
          insertErr = ie
        }
        if (insertErr != null) {
          throw insertErr
        }
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* already rolled back 또는 연결 상태 */
        }
        handleDbError(e, req, res)
      } finally {
        client.release()
      }
    },
  )

  apiRouter.get(
    '/admin/platform/industries/:industryId/tenants',
    ...platformIndustryTenantCreateGuard,
    async (req, res) => {
      try {
        const industryIdParsed = parsePositiveIndustryIdParam(req.params.industryId)
        if (industryIdParsed == null) {
          res.status(400).json({ message: '유효한 industryId 가 필요합니다.' })
          return
        }

        const indChk = await pool.query(
          `SELECT id, status FROM industries WHERE id = $1 LIMIT 1`,
          [industryIdParsed],
        )
        if ((indChk.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '해당 업종을 찾을 수 없습니다.' })
          return
        }
        const indSt = String(indChk.rows[0]?.status ?? '').trim().toLowerCase()
        if (indSt !== 'active') {
          res.status(400).json({ message: '활성 상태의 업종만 조회할 수 있습니다.' })
          return
        }

        const { rows } = await pool.query(
          `
          SELECT
            t.id,
            t.industry_id,
            i.code AS industry_code,
            t.code,
            t.name,
            t.status,
            t.legacy_ga_id,
            t.crm_customer_template_id,
            t.seat_limit,
            t.license_policy,
            t.billing_entitlement,
            t.created_at,
            t.updated_at,
            (
              SELECT COUNT(*)::int
              FROM user_memberships m
              INNER JOIN users u ON u.id = m.user_id
              WHERE m.scope_type = 'tenant'
                AND m.tenant_id IS NOT DISTINCT FROM t.id
                AND COALESCE(m.scope_id, '') = t.id::text
                AND m.role IN ('staff', 'user')
                AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
                AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
                AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
            ) AS active_seat_count
          FROM tenants t
          LEFT JOIN industries i ON i.id = t.industry_id
          WHERE t.industry_id = $1
          ORDER BY t.id ASC
          `,
          [industryIdParsed],
        )

        res.json({
          items: rows.map((row) => {
            const active = Number(row.active_seat_count ?? 0) || 0
            return mapIndustryTenantRowExtended(row, active)
          }),
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.patch(
    '/admin/platform/industries/:industryId/tenants/:tenantId/seat-billing',
    ...platformIndustryTenantCreateGuard,
    async (req, res) => {
      try {
        const industryIdParsed = parsePositiveIndustryIdParam(req.params.industryId)
        const tenantIdParsed = parsePositiveTenantIdParam(req.params.tenantId)
        if (industryIdParsed == null || tenantIdParsed == null) {
          res.status(400).json({ message: '유효한 industryId·tenantId 가 필요합니다.' })
          return
        }

        const body = req.body != null && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}
        const hasSeatKey = Object.prototype.hasOwnProperty.call(body, 'seatLimit')
          || Object.prototype.hasOwnProperty.call(body, 'seat_limit')
        const hasLpKey =
          Object.prototype.hasOwnProperty.call(body, 'licensePolicy')
          || Object.prototype.hasOwnProperty.call(body, 'license_policy')
        const hasBeKey =
          Object.prototype.hasOwnProperty.call(body, 'billingEntitlement')
          || Object.prototype.hasOwnProperty.call(body, 'billing_entitlement')

        const rawSeat = Object.prototype.hasOwnProperty.call(body, 'seatLimit')
          ? body.seatLimit
          : Object.prototype.hasOwnProperty.call(body, 'seat_limit')
            ? body.seat_limit
            : undefined
        const seatParsed = parseSeatLimitForApiPatch(rawSeat)
        if (seatParsed.kind === 'error') {
          res.status(400).json({ message: seatParsed.message })
          return
        }
        /** @type {unknown} */
        let licensePatchInput = undefined
        if (hasLpKey) {
          licensePatchInput =
            Object.prototype.hasOwnProperty.call(body, 'licensePolicy') ? body.licensePolicy : body.license_policy
        }

        /** @type {unknown} */
        let billingRaw = undefined
        if (hasBeKey) {
          billingRaw =
            Object.prototype.hasOwnProperty.call(body, 'billingEntitlement')
              ? body.billingEntitlement
              : body.billing_entitlement
        }

        if (!hasSeatKey && !hasLpKey && !hasBeKey) {
          res.status(400).json({
            message: 'seatLimit, licensePolicy, billingEntitlement 중 하나 이상을 보내야 합니다.',
          })
          return
        }

        const indChk = await pool.query(`SELECT id, status FROM industries WHERE id = $1 LIMIT 1`, [
          industryIdParsed,
        ])
        if ((indChk.rowCount ?? 0) === 0) {
          res.status(404).json({ message: '해당 업종을 찾을 수 없습니다.' })
          return
        }
        const indSt = String(indChk.rows[0]?.status ?? '').trim().toLowerCase()
        if (indSt !== 'active') {
          res.status(400).json({ message: '활성 상태의 업종만 테넌트 정책을 수정할 수 있습니다.' })
          return
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          const tRes = await client.query(
            `
            SELECT id, industry_id, seat_limit, license_policy, billing_entitlement, status
            FROM tenants
            WHERE id = $1
            FOR UPDATE
            `,
            [tenantIdParsed],
          )
          if ((tRes.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK')
            res.status(404).json({ message: '해당 테넌트를 찾을 수 없습니다.' })
            return
          }
          const t0 = /** @type {{ seat_limit?: unknown; license_policy?: unknown; billing_entitlement?: unknown; industry_id?: unknown }} */ (
            tRes.rows[0]
          )
          const tInd =
            /** @type {unknown} */
            (t0.industry_id) != null ? Number(t0.industry_id) : Number.NaN
          if (!Number.isSafeInteger(tInd) || tInd !== industryIdParsed) {
            await client.query('ROLLBACK')
            res.status(409).json({ message: '테넌트가 해당 업종에 속하지 않습니다.' })
            return
          }
          const tenantSt = String(t0.status ?? '').trim().toLowerCase()
          if (tenantSt !== 'active') {
            await client.query('ROLLBACK')
            res.status(400).json({ message: '활성 상태의 테넌트만 정책을 수정할 수 있습니다.' })
            return
          }

          let nextSeat = t0.seat_limit
          if (seatParsed.kind === 'set') {
            nextSeat = seatParsed.value
          }

          let nextLp = t0.license_policy
          if (hasLpKey) {
            const m = mergeLicensePolicyForPatch(t0.license_policy, licensePatchInput)
            if (!m.ok) {
              await client.query('ROLLBACK')
              res.status(400).json({ message: m.message })
              return
            }
            nextLp = m.merged
          }

          let nextBe = t0.billing_entitlement
          if (hasBeKey) {
            const parsedBe = billingEntitlementFromInput(billingRaw ?? null)
            if (parsedBe === null) {
              await client.query('ROLLBACK')
              res.status(400).json({ message: 'billingEntitlement JSON 크기가 너무 큽니다.' })
              return
            }
            nextBe = parsedBe ?? {}
          }

          const updRes = await client.query(
            `
            UPDATE tenants
            SET seat_limit = $2,
                license_policy = $3::jsonb,
                billing_entitlement = $4::jsonb,
                updated_at = NOW()
            WHERE id = $1
              AND industry_id = $5
            RETURNING
              *,
              (SELECT code FROM industries i WHERE i.id = tenants.industry_id) AS industry_code
            `,
            [tenantIdParsed, nextSeat, JSON.stringify(nextLp ?? {}), JSON.stringify(nextBe ?? {}), industryIdParsed],
          )
          if ((updRes.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK')
            res.status(404).json({ message: '테넌트를 갱신할 수 없습니다.' })
            return
          }

          await client.query('COMMIT')

          const outRow = updRes.rows[0]
          const activeSeatCount = await countActiveTenantSeatMemberships(pool, tenantIdParsed)

          await logSecurityEvent(pool, {
            actorUserId: String(req.user?.id ?? ''),
            actorRole: String(req.user?.role ?? ''),
            action: 'PLATFORM_TENANT_SEAT_BILLING_PATCH',
            targetType: 'tenant',
            targetId: String(tenantIdParsed),
            meta: { industryId: industryIdParsed, fields: { seat: hasSeatKey, license: hasLpKey, billing: hasBeKey } },
          })

          res.json(mapIndustryTenantRowExtended(outRow, activeSeatCount))
        } catch (err) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* already rolled back */
          }
          throw err
        } finally {
          client.release()
        }
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/industries/:industryId/tenants',
    ...platformIndustryTenantCreateGuard,
    async (req, res) => {
      const industryIdParsed = parsePositiveIndustryIdParam(req.params.industryId)
      if (industryIdParsed == null) {
        res.status(400).json({ message: '유효한 industryId 가 필요합니다.' })
        return
      }

      const parsed = parseTenantCreateInput(req.body)
      if (!parsed.ok) {
        res.status(parsed.status).json({ message: parsed.message })
        return
      }

      const { code, name, status, legacyGaId, config } = parsed.payload

      /** @type {string} */
      let configSerialized
      try {
        configSerialized = JSON.stringify(config)
      } catch {
        res.status(400).json({ message: 'config를 직렬화할 수 없습니다.' })
        return
      }
      if (configSerialized.length > MAX_CONFIG_JSON_LENGTH) {
        res
          .status(400)
          .json({ message: 'config JSON 크기는 10000자 이하여야 합니다.' })
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const indRes = await client.query(
          `SELECT id, code, status FROM industries WHERE id = $1 LIMIT 1`,
          [industryIdParsed],
        )
        const indRow = indRes.rows[0]
        if (!indRow) {
          await client.query('ROLLBACK')
          res.status(404).json({ message: '해당 업종을 찾을 수 없습니다.' })
          return
        }
        const industrySt = String(indRow.status ?? '').trim().toLowerCase()
        if (industrySt !== 'active') {
          await client.query('ROLLBACK')
          res
            .status(400)
            .json({ message: '활성 상태의 업종에만 테넌트를 생성할 수 있습니다.' })
          return
        }
        const industryCode = String(indRow.code ?? '').trim()

        const dupCode = await client.query(`SELECT id FROM tenants WHERE code = $1 LIMIT 1`, [code])
        if ((dupCode.rowCount ?? 0) > 0) {
          await client.query('ROLLBACK')
          res.status(409).json({ message: '이미 존재하는 테넌트 코드입니다.' })
          return
        }

        if (legacyGaId != null) {
          const gaRes = await client.query(
            `
            SELECT id
            FROM ga_companies
            WHERE id = $1
              AND COALESCE(is_deleted, FALSE) IS NOT TRUE
            LIMIT 1
            `,
            [legacyGaId],
          )
          if ((gaRes.rowCount ?? 0) === 0) {
            await client.query('ROLLBACK')
            res.status(404).json({ message: '해당 GA를 찾을 수 없습니다.' })
            return
          }

          const dupGa = await client.query(
            `SELECT id FROM tenants WHERE legacy_ga_id = $1 LIMIT 1`,
            [legacyGaId],
          )
          if ((dupGa.rowCount ?? 0) > 0) {
            await client.query('ROLLBACK')
            res.status(409).json({ message: '이미 다른 테넌트에 연결된 GA입니다.' })
            return
          }
        }

        const r2KeyPrefix = buildTenantR2KeyPrefixTemplate(industryCode, code)

        let insRows = /** @type {object[]} */ ([])
        try {
          const insRes = await client.query(
            `
            INSERT INTO tenants (
              industry_id,
              code,
              name,
              status,
              legacy_ga_id,
              r2_key_prefix,
              config
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
            RETURNING id, industry_id, code, name, status, legacy_ga_id, crm_customer_template_id, created_at, updated_at
            `,
            [industryIdParsed, code, name, status, legacyGaId, r2KeyPrefix, configSerialized],
          )
          insRows = insRes.rows
        } catch (ie) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* already rolled back */
          }
          if (
            ie &&
            typeof ie === 'object' &&
            'code' in ie &&
            /** @type {{ code?: string; constraint?: string }} */ (ie).code === '23505'
          ) {
            const c = /** @type {{ constraint?: string }} */ (ie).constraint ?? ''
            if (
              c === 'tenants_legacy_ga_id_key' ||
              String(c).toLowerCase().includes('legacy_ga_id')
            ) {
              res
                .status(409)
                .json({ message: '이미 다른 테넌트에 연결된 GA입니다.' })
              return
            }
            res.status(409).json({ message: '이미 존재하는 테넌트 코드입니다.' })
            return
          }
          throw ie
        }

        await client.query('COMMIT')

        const row = insRows[0]
        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_CREATE',
          targetType: 'tenant',
          targetId: String(row.id),
          meta: {
            industryId: industryIdParsed,
            industryCode,
            code: row.code,
            legacyGaId,
          },
        })

        res.status(201).json({
          id: String(row.id),
          industryId: String(row.industry_id),
          industryCode,
          code: row.code,
          name: row.name,
          status: row.status,
          legacyGaId: row.legacy_ga_id != null ? Number(row.legacy_ga_id) : null,
          crmCustomerTemplateId:
            row.crm_customer_template_id != null && row.crm_customer_template_id !== ''
              ? Number(row.crm_customer_template_id)
              : null,
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        })
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* already rolled back */
        }
        if (
          e &&
          typeof e === 'object' &&
          'code' in e &&
          /** @type {{ code?: string; constraint?: string }} */ (e).code === '23505'
        ) {
          const c = /** @type {{ constraint?: string }} */ (e).constraint ?? ''
          if (
            c === 'tenants_legacy_ga_id_key' ||
            String(c).toLowerCase().includes('legacy_ga_id')
          ) {
            res
              .status(409)
              .json({ message: '이미 다른 테넌트에 연결된 GA입니다.' })
            return
          }
          res.status(409).json({ message: '이미 존재하는 테넌트 코드입니다.' })
          return
        }
        handleDbError(e, req, res)
      } finally {
        client.release()
      }
    },
  )

  apiRouter.get(
    '/admin/platform/tenants/:tenantId/admins',
    ...platformTenantAdminManagerGuard,
    async (req, res) => {
      try {
        const tgt = /** @type {{ tenantId: number, industryId: number } | undefined} */ (
          req.platformTenantAdminManage
        )
        if (tgt == null) {
          res.status(500).json({ message: '플랫폼 테넌트 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdParsed = tgt.tenantId
        const scopeIdStr = String(tenantIdParsed)

        const { rows } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.role AS legacy_role,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.tenant_id,
            m.industry_id,
            m.status,
            m.created_at,
            m.updated_at
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE m.tenant_id IS NOT DISTINCT FROM $1
            AND COALESCE(m.scope_id, '') = $2
            AND m.role = 'tenant_admin'
            AND m.scope_type = 'tenant'
            AND m.status = 'active'
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
          ORDER BY m.id ASC
          `,
          [tenantIdParsed, scopeIdStr],
        )

        res.json({
          items: rows.map((row) => mapTenantAdminMemberItem(row)),
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/tenants/:tenantId/admins',
    ...platformTenantAdminManagerGuard,
    async (req, res) => {
      const tgt = /** @type {{ tenantId: number, industryId: number } | undefined} */ (
        req.platformTenantAdminManage
      )
      if (tgt == null) {
        res.status(500).json({ message: '플랫폼 테넌트 관리 컨텍스트가 없습니다.' })
        return
      }
      const tenantIdParsed = tgt.tenantId
      const industryIdParsed = tgt.industryId
      const scopeIdStr = String(tenantIdParsed)

      const body = req.body
      const rawUserId = body?.userId
      if (rawUserId === undefined || rawUserId === null) {
        res.status(400).json({ message: 'userId가 필요합니다.' })
        return
      }
      if (typeof rawUserId !== 'string') {
        res.status(400).json({ message: 'userId는 문자열이어야 합니다.' })
        return
      }
      const userIdTrim = rawUserId.trim()
      if (userIdTrim === '') {
        res.status(400).json({ message: 'userId가 필요합니다.' })
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const tchk = await client.query(
          `
          SELECT id, industry_id, status
          FROM tenants
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
          `,
          [tenantIdParsed],
        )
        if ((tchk.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ message: '해당 테넌트를 찾을 수 없습니다.' })
          return
        }
        /** @type {{ id?: unknown; industry_id?: unknown; status?: unknown }} */
        const tRow0 = tchk.rows[0]
        const tInd =
          tRow0.industry_id != null ? Number(tRow0.industry_id) : Number.NaN
        if (!Number.isSafeInteger(tInd) || tInd !== industryIdParsed) {
          await client.query('ROLLBACK')
          res.status(409).json({ message: '테넌트 업종 정보가 일치하지 않습니다.' })
          return
        }
        const tenantSt = String(tRow0.status ?? '').trim().toLowerCase()
        if (tenantSt !== 'active') {
          await client.query('ROLLBACK')
          res.status(400).json({ message: '활성 상태의 테넌트만 관리할 수 있습니다.' })
          return
        }

        const userCheck = await client.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
            AND COALESCE(is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(status::text, ''))) = 'active'
          LIMIT 1
          `,
          [userIdTrim],
        )
        if ((userCheck.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({
            message: '사용자를 찾을 수 없거나 활성 상태가 아닙니다.',
          })
          return
        }

        const existing = await client.query(
          `
          SELECT id AS membership_id, status
          FROM user_memberships
          WHERE user_id = $1
            AND role = 'tenant_admin'
            AND scope_type = 'tenant'
            AND COALESCE(scope_id, '') = $2
            AND tenant_id IS NOT DISTINCT FROM $3
            AND industry_id IS NOT DISTINCT FROM $4
          FOR UPDATE
          `,
          [userIdTrim, scopeIdStr, tenantIdParsed, industryIdParsed],
        )

        if ((existing.rowCount ?? 0) > 0) {
          /** @type {{ membership_id?: unknown; status?: unknown }} */
          const ex = existing.rows[0]
          const mid = Number(ex.membership_id)
          const stRaw = String(ex.status ?? '').trim().toLowerCase()

          if (stRaw === 'active') {
            const fullActive = await selectTenantAdminMembershipById(client, mid)
            await client.query('COMMIT')
            if (fullActive != null) {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_TENANT_ADMIN_ASSIGN',
                targetType: 'tenant',
                targetId: String(tenantIdParsed),
                meta: {
                  tenantId: tenantIdParsed,
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(
                  mapTenantAdminAssignResponse(
                    /** @type {object} */ (fullActive),
                    'already_active',
                  ),
                )
            } else {
              handleDbError(new Error('[platform-admin] stale tenant admin membership'), req, res)
            }
            return
          }

          await client.query(
            `
            UPDATE user_memberships
            SET status = 'active',
                updated_at = NOW()
            WHERE id = $1
            `,
            [mid],
          )
          const reactivatedRow = await selectTenantAdminMembershipById(client, mid)
          await client.query('COMMIT')
          if (reactivatedRow != null) {
            await logSecurityEvent(pool, {
              actorUserId: String(req.user?.id ?? ''),
              actorRole: String(req.user?.role ?? ''),
              action: 'PLATFORM_TENANT_ADMIN_ASSIGN',
              targetType: 'tenant',
              targetId: String(tenantIdParsed),
              meta: {
                tenantId: tenantIdParsed,
                industryId: industryIdParsed,
                userId: userIdTrim,
                result: 'reactivated',
              },
            })
            res
              .status(200)
              .json(
                mapTenantAdminAssignResponse(
                  /** @type {object} */ (reactivatedRow),
                  'reactivated',
                ),
              )
          } else {
            handleDbError(new Error('[platform-admin] tenant admin reactivate inconsistent'), req, res)
          }
          return
        }

        /** @type {unknown} */
        let insertErr = null
        try {
          const insRes = await client.query(
            `
            INSERT INTO user_memberships (
              user_id,
              role,
              scope_type,
              scope_id,
              industry_id,
              tenant_id,
              status
            )
            VALUES ($1, 'tenant_admin', 'tenant', $2, $3, $4, 'active')
            RETURNING id
            `,
            [userIdTrim, scopeIdStr, industryIdParsed, tenantIdParsed],
          )
          const newIdRaw = insRes.rows[0]?.id
          const newId =
            typeof newIdRaw === 'bigint'
              ? Number(newIdRaw)
              : typeof newIdRaw === 'number'
                ? newIdRaw
                : Number(newIdRaw)
          const createdRow = await selectTenantAdminMembershipById(client, newId)
          if (createdRow == null) {
            throw new Error('[platform-admin] tenant_admin insert inconsistent')
          }
          await client.query('COMMIT')
          await logSecurityEvent(pool, {
            actorUserId: String(req.user?.id ?? ''),
            actorRole: String(req.user?.role ?? ''),
            action: 'PLATFORM_TENANT_ADMIN_ASSIGN',
            targetType: 'tenant',
            targetId: String(tenantIdParsed),
            meta: {
              tenantId: tenantIdParsed,
              industryId: industryIdParsed,
              userId: userIdTrim,
              result: 'created',
            },
          })
          res.status(201).json(mapTenantAdminAssignResponse(createdRow, 'created'))
        } catch (ie) {
          if (
            ie &&
            typeof ie === 'object' &&
            'code' in ie &&
            /** @type {{ code?: string }} */ (ie).code === '23505'
          ) {
            await client.query('ROLLBACK')
            /** @type {unknown} */
            const recovered = await selectTenantAdminMembershipForUser(
              pool,
              tenantIdParsed,
              industryIdParsed,
              userIdTrim,
            )
            const recSt =
              recovered != null ? String(recovered.status ?? '').trim().toLowerCase() : ''
            if (recovered != null && recSt === 'active') {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_TENANT_ADMIN_ASSIGN',
                targetType: 'tenant',
                targetId: String(tenantIdParsed),
                meta: {
                  tenantId: tenantIdParsed,
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(
                  mapTenantAdminAssignResponse(
                    /** @type {object} */ (recovered),
                    'already_active',
                  ),
                )
            } else {
              res.status(409).json({ message: '멤버십이 충돌했습니다.' })
            }
            return
          }
          insertErr = ie
        }
        if (insertErr != null) {
          throw insertErr
        }
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* already rolled back 또는 연결 상태 */
        }
        handleDbError(e, req, res)
      } finally {
        client.release()
      }
    },
  )

  apiRouter.get(
    '/admin/platform/tenants/:tenantId/members',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdParsed = mgr.tenantId
        const scopeIdStr = String(tenantIdParsed)

        const qParsed = parseMembershipRoleQueryFilter(req.query.membershipRole)
        if (!qParsed.ok) {
          res.status(qParsed.status).json({ message: qParsed.message })
          return
        }

        /** @type {unknown[]} */
        const sqlParams =
          qParsed.filter == null ? [tenantIdParsed, scopeIdStr] : [tenantIdParsed, scopeIdStr, qParsed.filter]

        const roleSql =
          qParsed.filter == null ? `AND m.role IN ('staff','user')` : `AND m.role = $3`

        const { rows } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.display_name,
            u.role AS legacy_role,
            LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
            u.last_login_at,
            u.last_login_ip,
            (
              SELECT COUNT(*)::int
              FROM user_auth_sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > NOW()
            ) AS active_session_count,
            (
              SELECT COUNT(*)::int
              FROM user_registered_devices d
              WHERE d.user_id = u.id
                AND d.revoked_at IS NULL
            ) AS registered_device_count,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.tenant_id,
            m.industry_id,
            m.status,
            m.created_at,
            m.updated_at,
            m.membership_type,
            m.customer_access,
            u.phone_number AS phone_number
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE m.scope_type = 'tenant'
            AND m.tenant_id IS NOT DISTINCT FROM $1
            AND COALESCE(m.scope_id, '') = $2
            ${roleSql}
            AND m.status = 'active'
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
          ORDER BY m.role ASC, m.id ASC
          `,
          sqlParams,
        )

        res.json({
          items: rows.map((row) => mapTenantStaffUserMemberItem(row)),
        })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/tenants/:tenantId/members',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
        req.platformTenantMemberManage
      )
      if (mgr == null) {
        res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
        return
      }
      const tenantIdParsed = mgr.tenantId
      const industryIdParsed = mgr.industryId
      const scopeIdStr = String(tenantIdParsed)

      const bodyParsed = parseTenantMemberAssignBody(req.body)
      if (!bodyParsed.ok) {
        res.status(bodyParsed.status).json({ message: bodyParsed.message })
        return
      }
      const { userId: userIdTrim, membershipRole } = bodyParsed
      /** @type {'staff'|'user'} */
      const oppRole = membershipRole === 'staff' ? 'user' : 'staff'

      const client = await pool.connect()
      try {
        await client.query('BEGIN')

        const tchk = await client.query(
          `
          SELECT id, industry_id, status, seat_limit
          FROM tenants
          WHERE id = $1
          LIMIT 1
          FOR UPDATE
          `,
          [tenantIdParsed],
        )
        if ((tchk.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({ message: '해당 테넌트를 찾을 수 없습니다.' })
          return
        }
        /** @type {{ industry_id?: unknown; status?: unknown; seat_limit?: unknown }} */
        const tRow0 = tchk.rows[0]
        const tInd = tRow0.industry_id != null ? Number(tRow0.industry_id) : Number.NaN
        if (!Number.isSafeInteger(tInd) || tInd !== industryIdParsed) {
          await client.query('ROLLBACK')
          res.status(409).json({ message: '테넌트 업종 정보가 일치하지 않습니다.' })
          return
        }
        const tenantSt = String(tRow0.status ?? '').trim().toLowerCase()
        if (tenantSt !== 'active') {
          await client.query('ROLLBACK')
          res.status(400).json({ message: '활성 상태의 테넌트만 관리할 수 있습니다.' })
          return
        }

        const userCheck = await client.query(
          `
          SELECT id
          FROM users
          WHERE id = $1
            AND COALESCE(is_deleted, FALSE) IS NOT TRUE
            AND LOWER(TRIM(COALESCE(status::text, ''))) = 'active'
          LIMIT 1
          `,
          [userIdTrim],
        )
        if ((userCheck.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK')
          res.status(404).json({
            message: '사용자를 찾을 수 없거나 활성 상태가 아닙니다.',
          })
          return
        }

        const locked = await client.query(
          `
          SELECT id AS membership_id, role, status
          FROM user_memberships
          WHERE user_id = $1
            AND scope_type = 'tenant'
            AND tenant_id IS NOT DISTINCT FROM $2
            AND COALESCE(scope_id, '') = $3
            AND role IN ('staff', 'user')
          FOR UPDATE
          `,
          [userIdTrim, tenantIdParsed, scopeIdStr],
        )

        for (const r of locked.rows) {
          const roleStr = String(r.role ?? '').trim().toLowerCase()
          const st = String(r.status ?? '').trim().toLowerCase()
          if (roleStr === oppRole && st === 'active') {
            await client.query('ROLLBACK')
            res.status(409).json({
              message: '같은 테넌트에서 staff와 user 역할을 동시에 활성화할 수 없습니다.',
            })
            return
          }
        }

        const activeSeatTotal = await countActiveTenantSeatMemberships(client, tenantIdParsed)

        const sameRow = locked.rows.find(
          (rw) => String(rw.role ?? '').trim().toLowerCase() === membershipRole,
        )

        if (sameRow !== undefined) {
          const midRaw = sameRow.membership_id
          const mid =
            typeof midRaw === 'bigint'
              ? Number(midRaw)
              : typeof midRaw === 'number'
                ? midRaw
                : Number(midRaw)
          const stRaw = String(sameRow.status ?? '').trim().toLowerCase()

          if (stRaw === 'active') {
            const fullActive = await selectTenantStaffUserMembershipById(client, mid)
            await client.query('COMMIT')
            if (fullActive != null) {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_TENANT_MEMBER_ASSIGN',
                targetType: 'tenant',
                targetId: String(tenantIdParsed),
                meta: {
                  tenantId: tenantIdParsed,
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  membershipRole,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(mapTenantStaffUserAssignResponse(fullActive, 'already_active'))
            } else {
              handleDbError(
                new Error('[platform-admin] stale tenant staff/user membership'),
                req,
                res,
              )
            }
            return
          }

          const seatGuardRe = assertSeatAvailableForNewActivation({
            seatLimitColumn: tRow0.seat_limit,
            activeSeatCountBefore: activeSeatTotal,
          })
          if (!seatGuardRe.ok) {
            await client.query('ROLLBACK')
            res.status(409).json({ message: seatGuardRe.message })
            return
          }

          await client.query(
            `
            UPDATE user_memberships
            SET status = 'active',
                updated_at = NOW()
            WHERE id = $1
            `,
            [mid],
          )
          const reactivatedRow = await selectTenantStaffUserMembershipById(client, mid)
          await client.query('COMMIT')
          if (reactivatedRow != null) {
            await logSecurityEvent(pool, {
              actorUserId: String(req.user?.id ?? ''),
              actorRole: String(req.user?.role ?? ''),
              action: 'PLATFORM_TENANT_MEMBER_ASSIGN',
              targetType: 'tenant',
              targetId: String(tenantIdParsed),
              meta: {
                tenantId: tenantIdParsed,
                industryId: industryIdParsed,
                userId: userIdTrim,
                membershipRole,
                result: 'reactivated',
              },
            })
            res
              .status(200)
              .json(mapTenantStaffUserAssignResponse(reactivatedRow, 'reactivated'))
          } else {
            handleDbError(
              new Error('[platform-admin] tenant staff/user reactivate inconsistent'),
              req,
              res,
            )
          }
          return
        }

        /** @type {unknown} */
        let insertErr = null
        try {
          const seatGuardIns = assertSeatAvailableForNewActivation({
            seatLimitColumn: tRow0.seat_limit,
            activeSeatCountBefore: activeSeatTotal,
          })
          if (!seatGuardIns.ok) {
            await client.query('ROLLBACK')
            res.status(409).json({ message: seatGuardIns.message })
            return
          }

          const insRes = await client.query(
            `
            INSERT INTO user_memberships (
              user_id,
              role,
              scope_type,
              scope_id,
              industry_id,
              tenant_id,
              status
            )
            VALUES ($1, $2, 'tenant', $3, $4, $5, 'active')
            RETURNING id
            `,
            [userIdTrim, membershipRole, scopeIdStr, industryIdParsed, tenantIdParsed],
          )
          const newIdRaw = insRes.rows[0]?.id
          const newId =
            typeof newIdRaw === 'bigint'
              ? Number(newIdRaw)
              : typeof newIdRaw === 'number'
                ? newIdRaw
                : Number(newIdRaw)
          const createdRow = await selectTenantStaffUserMembershipById(client, newId)
          if (createdRow == null) {
            throw new Error('[platform-admin] tenant staff/user insert inconsistent')
          }
          await client.query('COMMIT')
          await logSecurityEvent(pool, {
            actorUserId: String(req.user?.id ?? ''),
            actorRole: String(req.user?.role ?? ''),
            action: 'PLATFORM_TENANT_MEMBER_ASSIGN',
            targetType: 'tenant',
            targetId: String(tenantIdParsed),
            meta: {
              tenantId: tenantIdParsed,
              industryId: industryIdParsed,
              userId: userIdTrim,
              membershipRole,
              result: 'created',
            },
          })
          res.status(201).json(mapTenantStaffUserAssignResponse(createdRow, 'created'))
        } catch (ie) {
          if (
            ie &&
            typeof ie === 'object' &&
            'code' in ie &&
            /** @type {{ code?: string }} */ (ie).code === '23505'
          ) {
            await client.query('ROLLBACK')
            /** @type {unknown} */
            const recovered = await selectTenantStaffUserMembershipForUser(
              pool,
              tenantIdParsed,
              industryIdParsed,
              userIdTrim,
              membershipRole,
            )
            const recSt =
              recovered != null ? String(recovered.status ?? '').trim().toLowerCase() : ''
            if (recovered != null && recSt === 'active') {
              await logSecurityEvent(pool, {
                actorUserId: String(req.user?.id ?? ''),
                actorRole: String(req.user?.role ?? ''),
                action: 'PLATFORM_TENANT_MEMBER_ASSIGN',
                targetType: 'tenant',
                targetId: String(tenantIdParsed),
                meta: {
                  tenantId: tenantIdParsed,
                  industryId: industryIdParsed,
                  userId: userIdTrim,
                  membershipRole,
                  result: 'already_active',
                },
              })
              res
                .status(200)
                .json(
                  mapTenantStaffUserAssignResponse(
                    /** @type {object} */ (recovered),
                    'already_active',
                  ),
                )
            } else {
              res.status(409).json({ message: '멤버십이 충돌했습니다.' })
            }
            return
          }
          insertErr = ie
        }
        if (insertErr != null) {
          throw insertErr
        }
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* already rolled back */
        }
        handleDbError(e, req, res)
      } finally {
        client.release()
      }
    },
  )

  apiRouter.get(
    '/admin/platform/tenants/:tenantId/users',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdParsed = mgr.tenantId
        const scopeIdStr = String(tenantIdParsed)
        const oaRaw = String(req.query.onlyActive ?? req.query.only_active ?? '').trim().toLowerCase()
        const seatsView = oaRaw === '1' || oaRaw === 'true'

        const activeMembershipSql = seatsView ?
            `
            AND m.status = 'active'
            AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'`
          : ''

        const { rows } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.display_name,
            u.role AS legacy_role,
            u.phone_number,
            LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
            u.last_login_at,
            u.last_login_ip,
            (
              SELECT COUNT(*)::int
              FROM user_auth_sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > NOW()
            ) AS active_session_count,
            (
              SELECT COUNT(*)::int
              FROM user_registered_devices d
              WHERE d.user_id = u.id
                AND d.revoked_at IS NULL
            ) AS registered_device_count,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.tenant_id,
            m.industry_id,
            m.membership_type,
            m.customer_access,
            m.status,
            m.created_at,
            m.updated_at
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE m.scope_type = 'tenant'
            AND m.tenant_id IS NOT DISTINCT FROM $1
            AND COALESCE(m.scope_id, '') = $2
            AND m.role IN ('staff','user','tenant_admin')
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
            ${activeMembershipSql}
          ORDER BY m.updated_at DESC NULLS LAST, m.id DESC
          `,
          [tenantIdParsed, scopeIdStr],
        )

        res.json({ items: rows.map((row) => mapTenantStaffUserMemberItem(row)) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/tenants/:tenantId/users',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdParsed = mgr.tenantId
        const industryIdParsed = mgr.industryId
        const scopeIdStr = String(tenantIdParsed)

        const raw = req.body ?? {}
        const username = String(raw.username ?? '').trim().toLowerCase()
        const displayName = String(raw.display_name ?? raw.displayName ?? '').trim()
        const password = String(raw.password ?? '')
        const rbacNorm = String(raw.rbacRole ?? raw.membershipRole ?? '').trim().toLowerCase()
        const membershipTypeNorm = String(raw.membershipType ?? raw.membership_type ?? '').trim().toLowerCase()
        const customerAccessNorm = String(raw.customerAccess ?? raw.customer_access ?? '').trim().toLowerCase()

        const userAcctStatusNorm = String(raw.status ?? raw.userStatus ?? 'active').trim().toLowerCase()
        const membStatusNorm = String(raw.membershipStatus ?? raw.membership_status ?? 'active')
          .trim()
          .toLowerCase()

        if (!username || username.length < 3) {
          res.status(400).json({ message: '유효한 로그인 아이디(username)가 필요합니다.' })
          return
        }
        if (!displayName) {
          res.status(400).json({ message: '이름(displayName)을 입력해 주세요.' })
          return
        }
        if (password.trim().length < 8) {
          res.status(400).json({ message: '비밀번호는 8자 이상입니다.' })
          return
        }
        if (!(rbacNorm === 'staff' || rbacNorm === 'user' || rbacNorm === 'tenant_admin')) {
          res.status(400).json({
            message: 'rbacRole(또는 membershipRole)은 staff, user, tenant_admin 중 하나여야 합니다.',
          })
          return
        }
        const memTypesAllowed = /** @type {const} */ (['agent', 'staff', 'admin', 'owner'])
        if (!(memTypesAllowed).includes(membershipTypeNorm)) {
          res.status(400).json({ message: `membershipType은 ${memTypesAllowed.join(', ')} 중 하나여야 합니다.` })
          return
        }
        const custAccAllowed = /** @type {const} */ (['none', 'own', 'tenant', 'assigned'])
        if (!(custAccAllowed).includes(customerAccessNorm)) {
          res.status(400).json({ message: `customerAccess은 ${custAccAllowed.join(', ')} 중 하나여야 합니다.` })
          return
        }
        if (!(userAcctStatusNorm === 'active' || userAcctStatusNorm === 'inactive' || userAcctStatusNorm === 'blocked')) {
          res.status(400).json({ message: 'status는 active, inactive 또는 blocked 입니다.' })
          return
        }
        const membershipStatusDb =
          membStatusNorm === 'inactive' || membStatusNorm === 'active' ? membStatusNorm : ''
        if (!membershipStatusDb) {
          res.status(400).json({ message: 'membershipStatus는 active 또는 inactive 입니다.' })
          return
        }

        /** CRM 설계사/스태프는 legacy users.role USER 고정 가입 스태프는 tenant 멤버십으로 구분한다. TODO: GA_STAFF 별도 레거시가 필요하면 확장 */
        const legacyUserRole = 'USER'

        const tchk = await pool.query(
          `
          SELECT id, legacy_ga_id, industry_id, status
          FROM tenants WHERE id = $1 LIMIT 1`,
          [tenantIdParsed],
        )
        const tRow = tchk.rows[0]
        if (!tRow) {
          res.status(404).json({ message: '테넌트를 찾을 수 없습니다.' })
          return
        }
        const tIndustry = Number(tRow.industry_id)
        if (!(Number.isSafeInteger(tIndustry) && tIndustry === industryIdParsed)) {
          res.status(409).json({ message: '테넌트 업종이 일치하지 않습니다.' })
          return
        }
        const tenantSt = String(tRow.status ?? '').trim().toLowerCase()
        if (tenantSt !== 'active') {
          res.status(400).json({ message: '활성 테넌트에만 사용자를 생성할 수 있습니다.' })
          return
        }

        const gaIdInt = parseGaId(tRow.legacy_ga_id)
        if (!(typeof gaIdInt === 'number' && Number.isInteger(gaIdInt) && gaIdInt >= 1)) {
          res.status(400).json({ message: '테넌트에 연결된 GA가 없습니다.' })
          return
        }

        const dup = await pool.query(
          `SELECT 1 FROM users WHERE username = $1 LIMIT 1`,
          [username],
        )
        if ((dup.rowCount ?? 0) > 0) {
          res.status(409).json({ message: '이미 존재하는 아이디입니다.' })
          return
        }

        const userIdNew = randomUUID()
        const passHash = await bcrypt.hash(password, 10)

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await client.query(
            `
            INSERT INTO users (
              id, username, password_hash, role, ga_id,
              display_name, phone_number,
              invited_by_user_id,
              status
            ) VALUES (
              $1, $2, $3, $4::text, $5::integer,
              $6, $7::text,
              $1::text,
              $8::text
            )
            `,
            [
              userIdNew,
              username,
              passHash,
              legacyUserRole,
              gaIdInt,
              displayName,
              '',
              userAcctStatusNorm,
            ],
          )

          await client.query(
            `
            INSERT INTO user_memberships (
              user_id, role, scope_type, scope_id,
              tenant_id, industry_id, status,
              membership_type, customer_access
            ) VALUES (
              $1::text,
              $2::text,
              'tenant',
              $3::text,
              $4::bigint,
              $5::bigint,
              $6::text,
              $7::text,
              $8::text
            )
            `,
            [
              userIdNew,
              rbacNorm,
              scopeIdStr,
              tenantIdParsed,
              industryIdParsed,
              membershipStatusDb,
              membershipTypeNorm,
              customerAccessNorm,
            ],
          )
          await client.query('COMMIT')
        } catch (e) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* */
          }
          throw e
        } finally {
          client.release()
        }

        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_USER_CREATE',
          targetType: 'user',
          targetId: userIdNew,
          meta: { tenantId: tenantIdParsed, username },
        })

        res.status(201).json({ userId: userIdNew, username })
      } catch (e) {
        if (/** @type {any} */ (e)?.code === '23505') {
          res.status(409).json({ message: '이미 존재하는 아이디입니다.' })
          return
        }
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get(
    '/admin/platform/tenants/:tenantId',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdStable = mgr.tenantId

        const { rows } = await pool.query(
          `
          SELECT
            t.id,
            t.industry_id,
            i.code AS industry_code,
            t.code,
            t.name,
            t.status,
            t.legacy_ga_id,
            t.crm_customer_template_id,
            t.seat_limit,
            t.license_policy,
            t.billing_entitlement,
            t.created_at,
            t.updated_at,
            (
              SELECT COUNT(*)::int
              FROM user_memberships m
              INNER JOIN users u ON u.id = m.user_id
              WHERE m.scope_type = 'tenant'
                AND m.tenant_id IS NOT DISTINCT FROM t.id
                AND COALESCE(m.scope_id, '') = t.id::text
                AND m.role IN ('staff', 'user')
                AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
                AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
                AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
            ) AS active_seat_count
          FROM tenants t
          LEFT JOIN industries i ON i.id = t.industry_id
          WHERE t.id = $1
          LIMIT 1
          `,
          [tenantIdStable],
        )

        const row = rows[0]
        if (!row) {
          res.status(404).json({ message: '테넌트를 찾을 수 없습니다.' })
          return
        }
        const active = Number(row.active_seat_count ?? 0) || 0
        res.json(mapIndustryTenantRowExtended(row, active))
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get(
    '/admin/platform/tenants/:tenantId/registration-codes',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number } | undefined} */ (req.platformTenantMemberManage)
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const { rows } = await pool.query(
          `
          SELECT
            rc.id,
            rc.code,
            rc.tenant_id,
            rc.industry_code,
            rc.default_membership_type,
            rc.default_customer_access,
            rc.default_role,
            rc.status,
            rc.expires_at,
            rc.max_uses,
            rc.used_count,
            rc.created_at,
            rc.updated_at
          FROM tenant_registration_codes rc
          WHERE rc.tenant_id = $1
          ORDER BY rc.id DESC
          `,
          [mgr.tenantId],
        )

        res.json({ items: rows.map((rw) => mapTenantRegistrationCodeRow(rw)) })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(
    '/admin/platform/tenants/:tenantId/registration-codes',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number } | undefined} */ (req.platformTenantMemberManage)
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const tenantIdStable = mgr.tenantId

        const rawBody = req.body ?? {}
        const codeNorm = normalizeTenantRegistrationCodeRaw(rawBody.code ?? rawBody.registrationCode)
        const maxUsesRaw = rawBody.maxUses ?? rawBody.max_uses
        let maxUsesParsed = null
        if (maxUsesRaw !== undefined && maxUsesRaw !== null && String(maxUsesRaw).trim() !== '') {
          const n = Number(maxUsesRaw)
          if (!Number.isInteger(n) || n < 0) {
            res.status(400).json({ message: 'maxUses는 0 이상의 정수이거나 비워두면 무제한입니다.' })
            return
          }
          maxUsesParsed = n
        }

        let expiresAtDb = null
        const expRaw = rawBody.expiresAt ?? rawBody.expires_at ?? null
        if (expRaw != null && String(expRaw).trim() !== '') {
          const d = new Date(expRaw)
          if (Number.isNaN(d.getTime())) {
            res.status(400).json({ message: 'expiresAt이 올바른 날짜·시각이 아닙니다.' })
            return
          }
          expiresAtDb = d.toISOString()
        }

        if (!codeNorm || codeNorm.length < 3 || codeNorm.length > 48) {
          res.status(400).json({ message: '코드는 3~48자(공백 제거 후)여야 합니다.' })
          return
        }

        const { rows: insRows } = await pool.query(
          `
          INSERT INTO tenant_registration_codes (
            code,
            tenant_id,
            industry_code,
            default_membership_type,
            default_customer_access,
            default_role,
            status,
            expires_at,
            max_uses
          )
          SELECT
            $1::text,
            t.id,
            ic.code::text,
            'agent',
            'own',
            'user',
            'active',
            $2::timestamptz,
            $3::integer
          FROM tenants t
          INNER JOIN industries ic ON ic.id = t.industry_id
          WHERE t.id = $4
            AND LOWER(TRIM(COALESCE(t.status::text, ''))) = 'active'
          RETURNING
            id,
            code,
            tenant_id,
            industry_code,
            default_membership_type,
            default_customer_access,
            default_role,
            status,
            expires_at,
            max_uses,
            used_count,
            created_at,
            updated_at
          `,
          [codeNorm, expiresAtDb, maxUsesParsed, tenantIdStable],
        )

        if (insRows.length === 0) {
          res.status(400).json({ message: '활성 테넌트에만 가입 코드를 생성할 수 있습니다.' })
          return
        }

        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_REG_CODE_CREATE',
          targetType: 'tenant_registration_code',
          targetId: String(insRows[0]?.id ?? ''),
          meta: { tenantId: tenantIdStable, code: codeNorm },
        })

        res.status(201).json(mapTenantRegistrationCodeRow(insRows[0]))
      } catch (e) {
        if (/** @type {any} */ (e)?.code === '23505') {
          res.status(409).json({ message: '이미 사용 중인 가입 코드입니다.' })
          return
        }
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.patch(
    '/admin/platform/tenants/:tenantId/registration-codes/:codeId',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number } | undefined} */ (req.platformTenantMemberManage)
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }
        const codeIdParsed = parsePositiveIndustryIdParam(req.params.codeId)
        if (codeIdParsed == null) {
          res.status(400).json({ message: '유효한 codeId가 필요합니다.' })
          return
        }

        const rawBody = req.body ?? {}
        const patch = {}

        const stNorm = rawBody.status != null ? String(rawBody.status).trim().toLowerCase() : ''
        if (stNorm) {
          if (stNorm !== 'active' && stNorm !== 'inactive') {
            res.status(400).json({ message: 'status는 active 또는 inactive 입니다.' })
            return
          }
          patch.status = stNorm
        }

        let maxUsesSet = undefined
        if (Object.prototype.hasOwnProperty.call(rawBody, 'maxUses') ||
          Object.prototype.hasOwnProperty.call(rawBody, 'max_uses')) {
          const rawMu = rawBody.maxUses ?? rawBody.max_uses
          if (rawMu === null || rawMu === '') {
            maxUsesSet = null
          } else {
            const n = Number(rawMu)
            if (!Number.isInteger(n) || n < 0) {
              res.status(400).json({ message: 'maxUses는 0 이상 정수이거나 null(무제한)입니다.' })
              return
            }
            maxUsesSet = n
          }
        }

        let expiresSet = undefined
        if (Object.prototype.hasOwnProperty.call(rawBody, 'expiresAt') ||
          Object.prototype.hasOwnProperty.call(rawBody, 'expires_at')) {
          const expRaw = rawBody.expiresAt ?? rawBody.expires_at ?? null
          if (expRaw === null || expRaw === '') {
            expiresSet = null
          } else {
            const d = new Date(expRaw)
            if (Number.isNaN(d.getTime())) {
              res.status(400).json({ message: 'expiresAt이 올바른 날짜·시각이 아닙니다.' })
              return
            }
            expiresSet = d.toISOString()
          }
        }

        if (!patch.status && maxUsesSet === undefined && expiresSet === undefined) {
          res.status(400).json({ message: '갱신할 필드가 없습니다.' })
          return
        }

        const sets = []
        const params = []
        let pi = 1
        if (patch.status) {
          sets.push(`status = $${pi}::text`)
          params.push(patch.status)
          pi += 1
        }
        if (maxUsesSet !== undefined) {
          sets.push(`max_uses = $${pi}::integer`)
          params.push(maxUsesSet)
          pi += 1
        }
        if (expiresSet !== undefined) {
          sets.push(`expires_at = $${pi}::timestamptz`)
          params.push(expiresSet)
          pi += 1
        }
        sets.push('updated_at = NOW()')

        params.push(codeIdParsed, mgr.tenantId)
        const idIx = pi
        const tenantIx = pi + 1

        const { rows } = await pool.query(
          `
          UPDATE tenant_registration_codes rc
          SET ${sets.join(', ')}
          WHERE rc.id = $${idIx}::bigint
            AND rc.tenant_id IS NOT DISTINCT FROM $${tenantIx}::bigint
          RETURNING
            id,
            code,
            tenant_id,
            industry_code,
            default_membership_type,
            default_customer_access,
            default_role,
            status,
            expires_at,
            max_uses,
            used_count,
            created_at,
            updated_at
          `,
          params,
        )

        if (rows.length === 0) {
          res.status(404).json({ message: '가입 코드를 찾지 못했습니다.' })
          return
        }

        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_REG_CODE_PATCH',
          targetType: 'tenant_registration_code',
          targetId: String(rows[0]?.id ?? ''),
          meta: {
            tenantId: mgr.tenantId,
            codeId: codeIdParsed,
            patchKeys: [...(patch.status ? ['status'] : []), ...(maxUsesSet !== undefined ? ['maxUses'] : []), ...(expiresSet !== undefined ? ['expiresAt'] : [])],
          },
        })

        res.json(mapTenantRegistrationCodeRow(rows[0]))
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  /**
   * `userId` 문자열 라우트 파라미터(공백 허용 X).
   * @param {unknown} raw
   */
  function parseUrlUserIdParam(raw) {
    const s = String(raw ?? '').trim()
    return s !== '' ? s : null
  }

  apiRouter.patch(
    '/admin/platform/tenants/:tenantId/users/:userId/status',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }

        const userIdTrim = parseUrlUserIdParam(req.params.userId)
        if (userIdTrim == null) {
          res.status(400).json({ message: 'userId 파라미터가 필요합니다.' })
          return
        }

        const rawStatus = req.body?.status ?? req.body?.userStatus ?? req.body?.user_status
        const userStat = String(rawStatus ?? '').trim().toLowerCase()
        if (!(userStat === 'active' || userStat === 'inactive' || userStat === 'blocked')) {
          res.status(400).json({ message: 'status는 active, inactive 또는 blocked 입니다.' })
          return
        }

        const membershipAuto =
          userStat === 'active' ? 'active' : 'inactive'

        const tenantIdStable = mgr.tenantId
        const scopeIdStr = String(tenantIdStable)

        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          const mRes = await client.query(
            `
            UPDATE user_memberships m
            SET status = $4::text, updated_at = NOW()
            FROM users u
            WHERE m.user_id = u.id
              AND u.id::text = $1::text
              AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
              AND m.scope_type = 'tenant'
              AND m.tenant_id IS NOT DISTINCT FROM $2::bigint
              AND COALESCE(m.scope_id, '') = $3
              AND m.role IN ('staff','user','tenant_admin')
            RETURNING m.id
            `,
            [userIdTrim, tenantIdStable, scopeIdStr, membershipAuto],
          )

          if (mRes.rowCount === 0) {
            await client.query('ROLLBACK')
            res.status(404).json({ message: '해당 테넌트 사용자 멤버십을 찾을 수 없습니다.' })
            return
          }

          await client.query(
            `
            UPDATE users
            SET status = $2::text, updated_at = NOW()
            WHERE id::text = $1::text
              AND COALESCE(is_deleted, FALSE) IS NOT TRUE
            `,
            [userIdTrim, userStat],
          )

          await client.query('COMMIT')
        } catch (e) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* */
          }
          throw e
        } finally {
          client.release()
        }

        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_USER_STATUS_PATCH',
          targetType: 'user',
          targetId: userIdTrim,
          meta: { tenantId: tenantIdStable, userStatus: userStat, membershipStatus: membershipAuto },
        })

        const { rows: listRows } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.display_name,
            u.role AS legacy_role,
            u.phone_number,
            LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
            u.last_login_at,
            u.last_login_ip,
            (
              SELECT COUNT(*)::int
              FROM user_auth_sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > NOW()
            ) AS active_session_count,
            (
              SELECT COUNT(*)::int
              FROM user_registered_devices d
              WHERE d.user_id = u.id
                AND d.revoked_at IS NULL
            ) AS registered_device_count,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.tenant_id,
            m.industry_id,
            m.membership_type,
            m.customer_access,
            m.status,
            m.created_at,
            m.updated_at
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE u.id::text = $3::text
            AND m.scope_type = 'tenant'
            AND m.tenant_id IS NOT DISTINCT FROM $1
            AND COALESCE(m.scope_id, '') = $2
            AND m.role IN ('staff','user','tenant_admin')
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
          LIMIT 1
          `,
          [tenantIdStable, scopeIdStr, userIdTrim],
        )

        if (listRows[0]) {
          res.json(mapTenantStaffUserMemberItem(listRows[0]))
          return
        }
        res.json({ ok: true, userId: userIdTrim })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.patch(
    '/admin/platform/tenants/:tenantId/users/:userId',
    ...platformTenantMemberManagerGuard,
    async (req, res) => {
      try {
        const mgr = /** @type {{ tenantId: number; industryId: number } | undefined} */ (
          req.platformTenantMemberManage
        )
        if (mgr == null) {
          res.status(500).json({ message: '플랫폼 테넌트 멤버 관리 컨텍스트가 없습니다.' })
          return
        }

        const userIdTrim = parseUrlUserIdParam(req.params.userId)
        if (userIdTrim == null) {
          res.status(400).json({ message: 'userId 파라미터가 필요합니다.' })
          return
        }

        const tenantIdStable = mgr.tenantId
        const scopeIdStr = String(tenantIdStable)
        const industryIdStable = mgr.industryId

        const rawBody = req.body ?? {}
        let displayUpd = undefined
        if (Object.prototype.hasOwnProperty.call(rawBody, 'display_name') ||
          Object.prototype.hasOwnProperty.call(rawBody, 'displayName')) {
          const dn = String(rawBody.display_name ?? rawBody.displayName ?? '').trim()
          displayUpd = dn
          if (!dn) {
            res.status(400).json({ message: '표시 이름이 비어 있습니다.' })
            return
          }
        }

        let rbacUpd = undefined
        const rawRb = rawBody.rbacRole ?? rawBody.membershipRole
        if (rawRb !== undefined && rawRb !== null && String(rawRb).trim() !== '') {
          rbacUpd = String(rawRb).trim().toLowerCase()
          if (!(rbacUpd === 'staff' || rbacUpd === 'user' || rbacUpd === 'tenant_admin')) {
            res.status(400).json({ message: 'rbacRole은 staff, user, tenant_admin 중 하나입니다.' })
            return
          }
        }

        let memTypeUpd = undefined
        const rawMt = rawBody.membershipType ?? rawBody.membership_type
        if (rawMt !== undefined && rawMt !== null && String(rawMt).trim() !== '') {
          memTypeUpd = String(rawMt).trim().toLowerCase()
          const allowedMt = /** @type {const} */ (['agent', 'staff', 'admin', 'owner'])
          if (!(allowedMt).includes(memTypeUpd)) {
            res.status(400).json({ message: `membershipType은 ${allowedMt.join(', ')} 중 하나입니다.` })
            return
          }
        }

        let custAccUpd = undefined
        const rawCa = rawBody.customerAccess ?? rawBody.customer_access
        if (rawCa !== undefined && rawCa !== null && String(rawCa).trim() !== '') {
          custAccUpd = String(rawCa).trim().toLowerCase()
          const allowedCa = /** @type {const} */ (['none', 'own', 'tenant', 'assigned'])
          if (!(allowedCa).includes(custAccUpd)) {
            res.status(400).json({ message: `customerAccess는 ${allowedCa.join(', ')} 중 하나입니다.` })
            return
          }
        }

        let userStsUpd = undefined
        const rawUs = rawBody.status ?? rawBody.userStatus ?? rawBody.user_status
        if (rawUs !== undefined && rawUs !== null && String(rawUs).trim() !== '') {
          userStsUpd = String(rawUs).trim().toLowerCase()
          if (!(userStsUpd === 'active' || userStsUpd === 'inactive' || userStsUpd === 'blocked')) {
            res.status(400).json({ message: 'status는 active, inactive 또는 blocked 입니다.' })
            return
          }
        }

        let membStsUpd = undefined
        const rawMs = rawBody.membershipStatus ?? rawBody.membership_status
        if (rawMs !== undefined && rawMs !== null && String(rawMs).trim() !== '') {
          const msLower = String(rawMs).trim().toLowerCase()
          if (!(msLower === 'active' || msLower === 'inactive')) {
            res.status(400).json({ message: 'membershipStatus는 active 또는 inactive 입니다.' })
            return
          }
          membStsUpd = msLower
        }

        const hasMembershipPatch =
          rbacUpd != null || memTypeUpd != null || custAccUpd != null || membStsUpd != null

        if (!(displayUpd !== undefined || userStsUpd != null || hasMembershipPatch)) {
          res.status(400).json({ message: '수정할 필드가 없습니다.' })
          return
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          const mSel = await client.query(
            `
            SELECT
              m.id AS membership_id
            FROM user_memberships m
            INNER JOIN users u ON u.id = m.user_id
            WHERE u.id::text = $3::text
              AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
              AND m.scope_type = 'tenant'
              AND m.tenant_id IS NOT DISTINCT FROM $1::bigint
              AND COALESCE(m.scope_id, '') = $2
              AND m.role IN ('staff','user','tenant_admin')
            LIMIT 1
            FOR UPDATE OF m
            `,
            [tenantIdStable, scopeIdStr, userIdTrim],
          )

          if (mSel.rowCount === 0) {
            await client.query('ROLLBACK')
            res.status(404).json({ message: '해당 테넌트 사용자 멤버십을 찾을 수 없습니다.' })
            return
          }

          if (displayUpd !== undefined) {
            await client.query(`UPDATE users SET display_name = $2, updated_at = NOW() WHERE id::text = $1::text`, [
              userIdTrim,
              displayUpd,
            ])
          }

          if (userStsUpd != null) {
            await client.query(`UPDATE users SET status = $2::text, updated_at = NOW() WHERE id::text = $1::text`, [
              userIdTrim,
              userStsUpd,
            ])
          }

          let effectiveMembSts = membStsUpd ?? null
          if (userStsUpd !== undefined && userStsUpd !== 'active') {
            effectiveMembSts = 'inactive'
          }

          const membershipId = /** @type {string | bigint} */ (mSel.rows[0]?.membership_id)
          const shouldPatchMembership =
            rbacUpd != null ||
            memTypeUpd != null ||
            custAccUpd != null ||
            effectiveMembSts != null

          if (shouldPatchMembership) {
            await client.query(
              `
              UPDATE user_memberships
              SET
                role = COALESCE($2::text, role),
                membership_type = COALESCE($3::text, membership_type),
                customer_access = COALESCE($4::text, customer_access),
                status = COALESCE($5::text, status),
                industry_id = $6::bigint,
                updated_at = NOW()
              WHERE id = $1::bigint
              `,
              [
                membershipId,
                rbacUpd ?? null,
                memTypeUpd ?? null,
                custAccUpd ?? null,
                effectiveMembSts,
                industryIdStable,
              ],
            )
          }

          await client.query('COMMIT')
        } catch (e) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* */
          }
          throw e
        } finally {
          client.release()
        }

        await logSecurityEvent(pool, {
          actorUserId: String(req.user?.id ?? ''),
          actorRole: String(req.user?.role ?? ''),
          action: 'PLATFORM_TENANT_USER_PATCH',
          targetType: 'user',
          targetId: userIdTrim,
          meta: {
            tenantId: tenantIdStable,
            ...(displayUpd !== undefined ? { displayName: true } : {}),
            ...(userStsUpd != null ? { userStatus: userStsUpd } : {}),
            ...(rbacUpd != null ? { rbacRole: rbacUpd } : {}),
            ...(memTypeUpd != null ? { membershipType: memTypeUpd } : {}),
            ...(custAccUpd != null ? { customerAccess: custAccUpd } : {}),
            ...(membStsUpd != null ? { membershipStatus: membStsUpd } : {}),
          },
        })

        const { rows: refreshed } = await pool.query(
          `
          SELECT
            m.id AS membership_id,
            m.user_id,
            u.username,
            u.display_name,
            u.role AS legacy_role,
            u.phone_number,
            LOWER(TRIM(COALESCE(u.status::text, ''))) AS user_account_status,
            u.last_login_at,
            u.last_login_ip,
            (
              SELECT COUNT(*)::int
              FROM user_auth_sessions s
              WHERE s.user_id = u.id
                AND s.revoked_at IS NULL
                AND s.expires_at > NOW()
            ) AS active_session_count,
            (
              SELECT COUNT(*)::int
              FROM user_registered_devices d
              WHERE d.user_id = u.id
                AND d.revoked_at IS NULL
            ) AS registered_device_count,
            m.role AS membership_role,
            m.scope_type,
            m.scope_id,
            m.tenant_id,
            m.industry_id,
            m.membership_type,
            m.customer_access,
            m.status,
            m.created_at,
            m.updated_at
          FROM user_memberships m
          INNER JOIN users u ON u.id = m.user_id
          WHERE u.id::text = $3::text
            AND m.scope_type = 'tenant'
            AND m.tenant_id IS NOT DISTINCT FROM $1
            AND COALESCE(m.scope_id, '') = $2
            AND m.role IN ('staff','user','tenant_admin')
            AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
          LIMIT 1
          `,
          [tenantIdStable, scopeIdStr, userIdTrim],
        )

        if (!refreshed[0]) {
          res.status(500).json({ message: '갱신 결과를 불러오지 못했습니다.' })
          return
        }

        res.json(mapTenantStaffUserMemberItem(refreshed[0]))
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.get('/admin/platform/tenants', ...guard, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          t.id,
          t.industry_id,
          i.code AS industry_code,
          t.code,
          t.name,
          t.status,
          t.legacy_ga_id,
          t.crm_customer_template_id,
          t.seat_limit,
          t.license_policy,
          t.billing_entitlement,
          t.created_at,
          t.updated_at,
          (
            SELECT COUNT(*)::int
            FROM user_memberships m
            INNER JOIN users u ON u.id = m.user_id
            WHERE m.scope_type = 'tenant'
              AND m.tenant_id IS NOT DISTINCT FROM t.id
              AND COALESCE(m.scope_id, '') = t.id::text
              AND m.role IN ('staff', 'user')
              AND LOWER(TRIM(COALESCE(m.status::text, ''))) = 'active'
              AND COALESCE(u.is_deleted, FALSE) IS NOT TRUE
              AND LOWER(TRIM(COALESCE(u.status::text, ''))) = 'active'
          ) AS active_seat_count
        FROM tenants t
        LEFT JOIN industries i ON i.id = t.industry_id
        ORDER BY t.id ASC
      `)
      res.json({
        items: rows.map((row) => {
          const active = Number(row.active_seat_count ?? 0) || 0
          return mapIndustryTenantRowExtended(row, active)
        }),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/platform/memberships', ...guard, async (req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          m.id AS membership_id,
          m.user_id,
          u.username,
          u.role AS legacy_role,
          m.role AS membership_role,
          m.scope_type,
          m.scope_id,
          m.tenant_id,
          t.code AS tenant_code,
          m.industry_id,
          ind.code AS industry_code,
          m.status,
          m.created_at,
          m.updated_at
        FROM user_memberships m
        INNER JOIN users u ON u.id = m.user_id
        LEFT JOIN tenants t ON t.id = m.tenant_id
        LEFT JOIN industries ind ON ind.id = m.industry_id
        WHERE COALESCE(u.is_deleted, FALSE) IS NOT TRUE
        ORDER BY u.username ASC NULLS LAST, m.role ASC, m.id ASC
      `)
      res.json({
        items: rows.map((row) => ({
          membershipId: String(row.membership_id),
          userId: String(row.user_id),
          username: String(row.username ?? ''),
          legacyRole: String(row.legacy_role ?? ''),
          membershipRole: String(row.membership_role ?? ''),
          scopeType: String(row.scope_type ?? ''),
          scopeId: row.scope_id != null ? String(row.scope_id) : null,
          tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
          tenantCode: row.tenant_code != null ? String(row.tenant_code) : null,
          industryId: row.industry_id != null ? String(row.industry_id) : null,
          industryCode: row.industry_code != null ? String(row.industry_code) : null,
          status: String(row.status ?? ''),
          createdAt: toIso(row.created_at),
          updatedAt: toIso(row.updated_at),
        })),
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/admin/platform/external-accounts/summary', ...guard, async (req, res) => {
    try {
      const tRes = await pool.query(
        `
        SELECT
          t.id,
          t.code,
          t.name,
          t.legacy_ga_id,
          g.code AS ga_code,
          g.name AS ga_name
        FROM tenants t
        INNER JOIN ga_companies g ON g.id = t.legacy_ga_id
        WHERE t.code = 'yjasset'
        LIMIT 1
        `,
      )
      if (tRes.rowCount === 0) {
        res.status(404).json({
          error: 'NOT_FOUND',
          message: 'code=yjasset 인 tenant 가 없습니다. initDb 또는 시드 상태를 확인하세요.',
        })
        return
      }
      const t = tRes.rows[0]
      const gaId = Number(t.legacy_ga_id)
      const imCounts = await pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE is_deleted IS NOT TRUE)::int AS total,
          COUNT(*) FILTER (
            WHERE is_deleted IS NOT TRUE
              AND UPPER(TRIM(COALESCE(status::text, ''))) = 'ACTIVE'
          )::int AS active
        FROM insurer_managers
        WHERE ga_id = $1
        `,
        [gaId],
      )
      const laCounts = await pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE is_deleted IS NOT TRUE)::int AS total,
          COUNT(*) FILTER (
            WHERE is_deleted IS NOT TRUE
              AND UPPER(TRIM(COALESCE(status::text, ''))) = 'ACTIVE'
          )::int AS active
        FROM loss_adjusters
        WHERE ga_id = $1
        `,
        [gaId],
      )
      const imRow = imCounts.rows[0] ?? { total: 0, active: 0 }
      const laRow = laCounts.rows[0] ?? { total: 0, active: 0 }

      res.json({
        tenant: {
          tenantId: String(t.id),
          tenantCode: String(t.code ?? ''),
          tenantName: String(t.name ?? ''),
          legacyGaId: gaId,
          gaCode: String(t.ga_code ?? '').trim(),
          gaName: String(t.ga_name ?? '').trim(),
        },
        insurerManagers: {
          total: Number(imRow.total ?? 0),
          active: Number(imRow.active ?? 0),
        },
        lossAdjusters: {
          total: Number(laRow.total ?? 0),
          active: Number(laRow.active ?? 0),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
