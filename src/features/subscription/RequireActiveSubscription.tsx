import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import {
  EXPIRED_FALLBACK_PATH,
  isAllowedForExpiredFrontend,
} from './expiredAllowlist'

/**
 * 구독 상태 기반 라우트 가드.
 *
 * ## 역할
 *
 *   - EXPIRED 가 아닌 유저(FREE / TRIAL / PAID / 구독 비대상 역할) 는 통과.
 *   - EXPIRED 유저는 화이트리스트(`EXPIRED_ALLOW_FRONTEND_PATHS`) 경로만 통과.
 *   - 그 외 경로로 접근하면 `EXPIRED_FALLBACK_PATH` 로 `replace` 리다이렉트.
 *
 * ## 위치
 *
 * `appRouter.tsx` 에서 `ProtectedRoute` 바로 안쪽, `AppWorkspaceLayout` 을
 * 감싸는 위치에 둔다. 즉 "로그인 확인 → 구독 상태 확인 → 공통 레이아웃" 순서.
 *
 * ## 개방 실패(open-fail) 정책
 *
 * 구독 정보가 아직 로드되지 않았거나 effectiveStatus 가 EXPIRED 가 아닐 때는
 * 항상 통과시킨다. 서버 측 `enforceActiveSubscription` 가 최종 방어선이므로,
 * 프론트 가드는 UX 를 위한 1 차 차단이다. 프론트만 믿고 서버를 느슨하게 두지
 * 않는다는 원칙을 유지한다.
 */
export function RequireActiveSubscription() {
  const { user } = useAuth()
  const location = useLocation()

  const effectiveStatus = user?.subscription?.effectiveStatus
  if (effectiveStatus !== 'EXPIRED') {
    return <Outlet />
  }

  if (isAllowedForExpiredFrontend(location.pathname)) {
    return <Outlet />
  }

  return (
    <Navigate
      to={EXPIRED_FALLBACK_PATH}
      replace
      state={{ from: location.pathname, reason: 'subscription-expired' }}
    />
  )
}

export default RequireActiveSubscription
