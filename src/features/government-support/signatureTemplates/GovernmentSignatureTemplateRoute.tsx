import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

export function GovernmentSignatureTemplateRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/government/login" replace />
  }
  return <Outlet />
}
