import type { GovernmentAccessSummary } from '../api/governmentSupportApi'
import { canManageGovernmentUsers, isGovernmentProgramUser } from './governmentAccess'

/** 운영 계정(업종·대행사 관리자·직원) — 사업장/고객 워크스페이스 아님 */
export function isGovernmentOperationalAccount(summary: GovernmentAccessSummary | null): boolean {
  if (!summary || isGovernmentProgramUser(summary)) return false
  if (summary.isSuperAdmin || summary.isGovernmentIndustryAdmin) return true
  if ((summary.governmentAgencyAdminTenantIds?.length ?? 0) > 0) return true
  if ((summary.governmentStaffTenantIds?.length ?? 0) > 0) return true
  return false
}

/** 공지·전달사항 등 운영 업무 메뉴 */
export function canManageGovernmentNotices(summary: GovernmentAccessSummary | null): boolean {
  return isGovernmentOperationalAccount(summary)
}

/** 사업장/고객/신청 워크스페이스 — 프로그램 이용자만 */
export function canAccessUserOwnedWorkspace(summary: GovernmentAccessSummary | null): boolean {
  return isGovernmentProgramUser(summary)
}

/** 로그인·게이트 후 기본 진입 경로 */
export function resolveGovernmentHomePath(summary: GovernmentAccessSummary | null): string {
  if (!summary) return '/government/login'
  if (isGovernmentProgramUser(summary)) return '/government/workspace'
  if (summary.isSuperAdmin || summary.isGovernmentIndustryAdmin) return '/government/admin/agencies'
  if (canManageGovernmentUsers(summary)) return '/government/admin/users'
  if ((summary.governmentStaffTenantIds?.length ?? 0) > 0) return '/government/admin/notices'
  return '/government/admin/notices'
}
