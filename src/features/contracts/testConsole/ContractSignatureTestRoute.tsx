import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canAccessContractSignatureAdminConsole } from './contractSignatureTestConsoleFlags'

/** 비활성 시 북마크 직접 진입도 차단 */
export function ContractSignatureTestRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!canAccessContractSignatureAdminConsole(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
