import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** 채널 담당자(INSURER_MANAGER / LOSS_ADJUSTER)는 하위 업무 접근 불가 */
export function RequireNotInsurerManagerRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (user.role === 'INSURER_MANAGER' || user.role === 'LOSS_ADJUSTER') {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
