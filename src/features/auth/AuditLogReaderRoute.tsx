import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { canReadSecurityAuditLogs } from './roleGuards'

/** SUPER_ADMIN · GA_ADMIN — 보안 감사 로그 조회 */
export function AuditLogReaderRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!canReadSecurityAuditLogs(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
