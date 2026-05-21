import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { useGovernmentAccess } from '../hooks/useGovernmentAccess'
import { resolveGovernmentHomePath } from '../lib/governmentHome'
import { isGovernmentGaSession } from '../lib/isGovernmentGaSession'

type GovernmentInsuranceRouteGuardProps = {
  children: React.ReactNode
}

/**
 * 보험 AppWorkspaceLayout 진입 차단 — GOVERNMENT_CRM GA 세션은 /government/* 로 보낸다.
 */
export default function GovernmentInsuranceRouteGuard({ children }: GovernmentInsuranceRouteGuardProps) {
  const { isAuthenticated, user, token } = useAuth()
  const location = useLocation()
  const isGovernmentGa = isAuthenticated && isGovernmentGaSession(user)
  const { summary, loading } = useGovernmentAccess(isGovernmentGa ? token : null)

  if (location.pathname.startsWith('/government')) {
    return children
  }

  if (!isGovernmentGa) {
    return children
  }

  if (loading || !summary) {
    return (
      <main className="page government-page government-page--gate">
        <p className="government-page__muted">권한을 확인하는 중…</p>
      </main>
    )
  }

  return <Navigate to={resolveGovernmentHomePath(summary)} replace />
}
