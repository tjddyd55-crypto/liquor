import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canAccessLiquorSignatureAdminConsole } from './liquorSignatureTemplateFlags'

/** 비활성 시 북마크 직접 진입도 차단 */
export function LiquorSignatureTemplateRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!canAccessLiquorSignatureAdminConsole(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
