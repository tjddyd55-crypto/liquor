import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { canUseConsentTemplateAdminRoutes } from './roleGuards'

/** GA_ADMIN · SUPER_ADMIN 전용 (동의서 템플릿 관리 — GA_STAFF는 읽기/운영 UI만) */
export function StaffRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!user || !canUseConsentTemplateAdminRoutes(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
