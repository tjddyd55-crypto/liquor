import { Outlet, useLocation, useMatches } from 'react-router-dom'
import CustomerAppShell from './CustomerAppShell'

type CustomerAppHandle = {
  customerAppMainLabel?: string
}

/**
 * 로그인 후 고객 앱 본문 라우트 공통 레이아웃.
 * Shell + Outlet — 연결(connect) 화면은 이 레이아웃 밖에 둔다.
 */
export default function CustomerAppMainLayout() {
  const { pathname } = useLocation()
  const matches = useMatches()
  const showClaimCta = pathname !== '/customer-app/requests/new'

  const leaf = matches[matches.length - 1]
  const title =
    (leaf?.handle as CustomerAppHandle | undefined)?.customerAppMainLabel ?? '고객 앱'

  return (
    <CustomerAppShell showClaimCta={showClaimCta} title={title}>
      <Outlet />
    </CustomerAppShell>
  )
}
