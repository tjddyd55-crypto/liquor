import type { GovernmentAccessSummary } from '../api/governmentSupportApi'
import { GOVERNMENT_INDUSTRY_CODE } from '../constants/governmentRoles'

export type GovernmentAccessState = 'loading' | 'denied' | 'industry_admin' | 'tenant_member' | 'super_admin'

export function resolveGovernmentAccessState(
  summary: GovernmentAccessSummary | null,
  loading: boolean,
  hasToken: boolean,
): GovernmentAccessState {
  if (!hasToken) {
    return 'denied'
  }
  if (loading) {
    return 'loading'
  }
  if (!summary) {
    return 'denied'
  }
  if (summary.isSuperAdmin) {
    return 'super_admin'
  }
  if (summary.isGovernmentIndustryAdmin) {
    return 'industry_admin'
  }
  if (summary.isGovernmentTenantMember) {
    return 'tenant_member'
  }
  return 'denied'
}

export function canAccessGovernmentAdmin(state: GovernmentAccessState): boolean {
  return state === 'super_admin' || state === 'industry_admin'
}

/** 사용자 관리 — 업종 관리자·super·대행사 관리자 */
export function canManageGovernmentUsers(summary: GovernmentAccessSummary | null): boolean {
  if (!summary) return false
  if (summary.isGovernmentProgramUser) return false
  if (summary.isSuperAdmin || summary.isGovernmentIndustryAdmin) return true
  return (summary.governmentAgencyAdminTenantIds?.length ?? 0) > 0
}

/** 기관 코드 가입 프로그램 이용자 */
export function isGovernmentProgramUser(summary: GovernmentAccessSummary | null): boolean {
  return summary?.isGovernmentProgramUser === true
}

/** @deprecated 워크스페이스는 프로그램 이용자 전용 — `canAccessUserOwnedWorkspace` 사용 */
export function canAccessGovernmentWorkspace(state: GovernmentAccessState): boolean {
  return state !== 'denied' && state !== 'loading'
}

export function governmentSignupIndustryCode(): typeof GOVERNMENT_INDUSTRY_CODE {
  return GOVERNMENT_INDUSTRY_CODE
}
