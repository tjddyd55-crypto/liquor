import type { AuthSession } from '../../auth/authApi'
import { fetchGovernmentAccessSummary } from '../api/governmentSupportApi'
import { resolveGovernmentHomePath } from './governmentHome'
import { isGovernmentGaSession } from './isGovernmentGaSession'
import { resolveAuthLandingPath } from '../../auth/landing'

/** 로그인·루트 진입 시 정부/보험 홈 경로 (비동기 — government membership API) */
export async function resolveGovernmentSessionHomePath(
  session: AuthSession,
  isMobile: boolean,
): Promise<string> {
  if (isGovernmentGaSession(session.user)) {
    const summary = await fetchGovernmentAccessSummary(session.token)
    return resolveGovernmentHomePath(summary)
  }
  return resolveAuthLandingPath(isMobile, session.user.role)
}

export function isGovernmentTenantMemberSummary(
  summary: {
    isGovernmentTenantMember?: boolean
    isGovernmentIndustryAdmin?: boolean
    isSuperAdmin?: boolean
    isGovernmentProgramUser?: boolean
  } | null,
): boolean {
  if (!summary) return false
  return (
    summary.isGovernmentTenantMember === true ||
    summary.isGovernmentIndustryAdmin === true ||
    summary.isSuperAdmin === true ||
    summary.isGovernmentProgramUser === true
  )
}
