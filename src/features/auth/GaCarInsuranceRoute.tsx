import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { isCarInsuranceFeatureEnabledForGa } from '../dashboard/gaTenantMenu'

/**
 * 자동차 보험 신청·작성·목록·결과 화면 — GA_CUSTOM_MENU에 해당 기능이 있는 테넌트만 허용.
 * SUPER_ADMIN은 운영 점검용으로 예외 허용.
 */
export function GaCarInsuranceRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (user.role === 'INSURER_MANAGER' || user.role === 'LOSS_ADJUSTER') {
    return <Navigate to="/dashboard" replace />
  }
  if (user.role === 'SUPER_ADMIN') {
    return <Outlet />
  }
  if (!isCarInsuranceFeatureEnabledForGa(user.gaCode)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
