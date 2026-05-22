import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canAccessLiquorSignatureUserSend } from '../signatureTemplates/liquorSignatureTemplateFlags'

export function LiquorSignatureUserSendRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!canAccessLiquorSignatureUserSend(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
