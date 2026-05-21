import { parseGaId } from './parseGaId.js'

const VALID_USER_ROLES = ['SUPER_ADMIN', 'GA_ADMIN', 'GA_STAFF', 'USER', 'INSURER_MANAGER', 'LOSS_ADJUSTER']

const LEGACY_USER_ROLE_MAP = {
  super_admin: 'SUPER_ADMIN',
  staff: 'GA_ADMIN',
  user: 'USER',
}

/** @param {unknown} value */
export function normalizeRbacRole(value) {
  const r = typeof value === 'string' ? value.trim() : ''
  if (VALID_USER_ROLES.includes(r)) {
    return r
  }
  if (Object.prototype.hasOwnProperty.call(LEGACY_USER_ROLE_MAP, r)) {
    return LEGACY_USER_ROLE_MAP[r]
  }
  return 'USER'
}

/** @param {unknown} role */
export function isSuperAdminRole(role) {
  return normalizeRbacRole(role) === 'SUPER_ADMIN'
}

/** GA_ADMIN · GA_STAFF · SUPER_ADMIN (원수사 연락처 등 기존 직원 가드) */
export function isGaOpsRole(role) {
  const n = normalizeRbacRole(role)
  return n === 'SUPER_ADMIN' || n === 'GA_ADMIN' || n === 'GA_STAFF'
}

/** @param {unknown} role */
export function isInsurerManagerRole(role) {
  return normalizeRbacRole(role) === 'INSURER_MANAGER'
}

/** @param {unknown} role */
export function isLossAdjusterRole(role) {
  return normalizeRbacRole(role) === 'LOSS_ADJUSTER'
}

/** 뉴스 채널 운영 계정(원수사/손해사정사) */
export function isNewsManagerRole(role) {
  const n = normalizeRbacRole(role)
  return n === 'INSURER_MANAGER' || n === 'LOSS_ADJUSTER'
}

/** 보험사 디렉터리·일반의뢰 등 수정 권한: SUPER_ADMIN · GA_ADMIN · GA_STAFF */
export function isGaTenantAdminRole(role) {
  const n = normalizeRbacRole(role)
  return n === 'SUPER_ADMIN' || n === 'GA_ADMIN' || n === 'GA_STAFF'
}

/** 원수사 담당자(insurer_managers) 생성·수정·상태변경: SUPER_ADMIN · GA_ADMIN · GA_STAFF */
export function isGaInsurerManagerMutatorRole(role) {
  const n = normalizeRbacRole(role)
  return n === 'SUPER_ADMIN' || n === 'GA_ADMIN' || n === 'GA_STAFF'
}

/** 전자서명 발송(본인 user_id 고객만) — USER · GA_STAFF */
export function isContractUserSendRole(role) {
  const n = normalizeRbacRole(role)
  return n === 'USER' || n === 'GA_STAFF'
}

/** @param {unknown} v */
export function parseCompanyScopeId(v) {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1) {
    return null
  }
  return n
}

/**
 * 요청당 유효 GA (쿼리 tenant_ga_id 는 SUPER_ADMIN 만 신뢰).
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 */
export async function resolveTenantGaIdForRequest(pool, req) {
  const role = normalizeRbacRole(req.user?.role)
  const userGa = parseGaId(req.user?.gaId)
  if (isSuperAdminRole(role)) {
    const body = req.body && typeof req.body === 'object' ? req.body : null
    const qGa = parseGaId(
      req.query?.tenant_ga_id ??
        req.query?.ga_id ??
        req.query?.gaId ??
        req.query?.tenantGaId ??
        body?.tenant_ga_id ??
        body?.ga_id ??
        body?.gaId ??
        body?.tenantGaId,
    )
    if (qGa != null) {
      const r = await pool.query(
        `
        SELECT 1 FROM ga_companies
        WHERE id = $1 AND is_deleted = false AND status = 'active'
        `,
        [qGa],
      )
      if (r.rowCount > 0) {
        return qGa
      }
    }
    return userGa
  }
  return userGa
}
