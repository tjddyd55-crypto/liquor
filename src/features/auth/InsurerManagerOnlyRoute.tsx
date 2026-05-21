import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import type { UserRole } from './authApi'

/** 채널 담당자(원수사/손해사정사) 전용 */
export function InsurerManagerOnlyRoute({
  allowedRoles = ['INSURER_MANAGER', 'LOSS_ADJUSTER'],
}: {
  allowedRoles?: UserRole[]
}) {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
