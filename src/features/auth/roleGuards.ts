import type { UserRole } from './authApi'

/** 원수사 연락처·회사 마스터 편집·조회에서 스태프로 취급하는 역할 */
export const INSURANCE_OPS_ROLES: UserRole[] = ['GA_ADMIN', 'GA_STAFF', 'SUPER_ADMIN']

export function isInsuranceOpsRole(role: string | undefined): role is UserRole {
  return role != null && (INSURANCE_OPS_ROLES as readonly string[]).includes(role)
}

/** 동의서 템플릿 관리(등록/수정) — GA_STAFF 제외 */
export const CONSENT_TEMPLATE_ADMIN_ROLES: UserRole[] = ['GA_ADMIN', 'SUPER_ADMIN']

export function canUseConsentTemplateAdminRoutes(role: string | undefined): boolean {
  return role != null && (CONSENT_TEMPLATE_ADMIN_ROLES as readonly string[]).includes(role)
}

/** @deprecated 내부 동의서 관리 경로 전용 — canUseConsentTemplateAdminRoutes 사용 */
export const STAFF_ROUTE_ROLES = CONSENT_TEMPLATE_ADMIN_ROLES

export function canUseStaffRoutes(role: string | undefined): boolean {
  return canUseConsentTemplateAdminRoutes(role)
}

export function isInsurerManagerRole(role: string | undefined): role is UserRole {
  return role === 'INSURER_MANAGER'
}

export function isLossAdjusterRole(role: string | undefined): role is UserRole {
  return role === 'LOSS_ADJUSTER'
}

export function isNewsManagerRole(role: string | undefined): role is UserRole {
  return role === 'INSURER_MANAGER' || role === 'LOSS_ADJUSTER'
}

/** 원수사 연락처·일반화재·담당자 등 서버에서 GA_ADMIN·GA_STAFF·SUPER_ADMIN 쓰기 허용 */
export function canMutateInsuranceDirectory(role: string | undefined): boolean {
  return role === 'GA_ADMIN' || role === 'GA_STAFF' || role === 'SUPER_ADMIN'
}

export function isGaStaffReadOnlyUi(role: string | undefined): boolean {
  return role === 'GA_STAFF'
}

/** 감사 로그 조회: SUPER_ADMIN · GA_ADMIN */
export function canReadSecurityAuditLogs(role: string | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'GA_ADMIN'
}

/** 대시보드에서 원수사 안내 문구(일반 GA 소속 담당자) */
export function isGaTenantStaffRole(role: string | undefined): boolean {
  return role === 'GA_ADMIN' || role === 'GA_STAFF'
}
