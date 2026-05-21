import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'

/** 프로그램 이용자 레이아웃 하위 — 부모 GovernmentProtectedRoute 가 이미 검증한다. */
export function GovernmentSignatureUserSendRoute() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/government/login" replace />
  }
  return <Outlet />
}
