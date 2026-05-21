import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'

/** SUPER_ADMIN 전용 */
export function SuperAdminRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login?required=1" replace />
  }
  if (user?.role !== 'SUPER_ADMIN') {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
