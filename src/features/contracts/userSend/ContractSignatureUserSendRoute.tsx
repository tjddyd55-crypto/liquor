import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { canAccessContractSignatureUserSend } from '../testConsole/contractSignatureTestConsoleFlags'

export function ContractSignatureUserSendRoute() {
  const { user, isAuthenticated } = useAuth()

  if (!isAuthenticated || !user) {
    return <Navigate to="/login?required=1" replace />
  }
  if (!canAccessContractSignatureUserSend(user.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}
