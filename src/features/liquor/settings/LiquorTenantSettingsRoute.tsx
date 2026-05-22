import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

const LIQUOR_SETTINGS_ROLES = new Set(['USER', 'GA_STAFF', 'GA_ADMIN'])

function isLiquorCrmSession(crmIndustryCode: string | null | undefined): boolean {
  return String(crmIndustryCode ?? '').trim().toLowerCase() === 'liquor'
}

/** 주류회사 CRM 전용 설정 라우트 */
export function LiquorTenantSettingsRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!LIQUOR_SETTINGS_ROLES.has(String(user.role ?? ''))) {
    return <Navigate to="/dashboard" replace />
  }
  if (!isLiquorCrmSession(user.crmIndustryCode)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
