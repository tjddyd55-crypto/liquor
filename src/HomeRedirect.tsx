import { Navigate } from 'react-router-dom'
import { useAuth } from './features/auth/AuthProvider'
import { resolveAuthLandingPath } from './features/auth/landing'
import useIsMobile from './hooks/useIsMobile'
import { useGovernmentAccess } from './features/government-support/hooks/useGovernmentAccess'
import { resolveGovernmentHomePath } from './features/government-support/lib/governmentHome'
import { isGovernmentGaSession } from './features/government-support/lib/isGovernmentGaSession'

/**
 * 루트(`/`) 인덱스 라우트 진입 처리.
 *
 * - 비로그인: `/login?required=1`
 * - 정부지원 GA 세션: `resolveGovernmentHomePath`
 * - 그 외: `resolveAuthLandingPath(isMobile, user.role)`
 */
export function PublicHomeEntry() {
  const { isAuthenticated, user, token } = useAuth()
  const isMobile = useIsMobile()
  const isGovernmentGa = isAuthenticated && isGovernmentGaSession(user)
  const { summary, loading } = useGovernmentAccess(isGovernmentGa ? token : null)

  if (!isAuthenticated) {
    return <Navigate to="/login?required=1" replace />
  }

  if (isGovernmentGa) {
    if (loading || !summary) {
      return (
        <main className="page government-page government-page--gate">
          <p className="government-page__muted">권한을 확인하는 중…</p>
        </main>
      )
    }
    return <Navigate to={resolveGovernmentHomePath(summary)} replace />
  }

  return <Navigate to={resolveAuthLandingPath(isMobile, user?.role)} replace />
}
