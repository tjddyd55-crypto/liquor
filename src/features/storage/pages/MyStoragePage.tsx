import { Navigate } from 'react-router-dom'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { useAuth } from '../../auth/AuthProvider'
import MyStoragePageMobileView from './MyStoragePage/MyStoragePageMobileView'
import MyStoragePagePCView from './MyStoragePage/MyStoragePagePCView'
import type { MyStorageViewProps } from './MyStoragePage/myStorageViewProps'

/**
 * "내 저장공간" 페이지 컨테이너.
 *
 * 역할:
 *  1) 로그인·권한 가드 (토큰 없음 → /login 리다이렉트, USER/GA_ADMIN 외 → 접근 거부 화면)
 *  2) PC/Mobile View 로 라우팅 (`ResponsiveLayout<ViewProps>`)
 *
 * 뷰가 양쪽 모두 얇은 wrapper (StorageWorkspace variant 만 다름) 지만,
 * 컨테이너에서 `useIsMobile` 을 호출하지 않고 View 경계에서 자연스럽게 분기되도록
 * 해 Tier 4 prop 승격 규칙을 유지한다.
 */
export default function MyStoragePage() {
  const { user, token } = useAuth()

  if (!token?.trim()) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'USER' && user?.role !== 'GA_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <p className="customers-page__denied">접근 권한 없음</p>
        </header>
      </main>
    )
  }

  const viewProps: MyStorageViewProps = {
    token,
    customerId: null,
    title: '내 저장공간',
    subtitle: '폴더와 파일은 최신순으로 정렬됩니다.',
  }

  return (
    <ResponsiveLayout<MyStorageViewProps>
      PC={MyStoragePagePCView}
      Mobile={MyStoragePageMobileView}
      viewProps={viewProps}
    />
  )
}
