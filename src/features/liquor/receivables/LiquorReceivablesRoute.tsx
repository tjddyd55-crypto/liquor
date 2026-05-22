import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

const LIQUOR_RECEIVABLES_ROLES = new Set(['USER', 'GA_STAFF', 'GA_ADMIN'])

function isLiquorCrmSession(crmIndustryCode: string | null | undefined): boolean {
  return String(crmIndustryCode ?? '').trim().toLowerCase() === 'liquor'
}

/** 주류회사 CRM 채권관리 라우트 */
export function LiquorReceivablesRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!LIQUOR_RECEIVABLES_ROLES.has(String(user.role ?? ''))) {
    return <Navigate to="/dashboard" replace />
  }
  if (!isLiquorCrmSession(user.crmIndustryCode)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
