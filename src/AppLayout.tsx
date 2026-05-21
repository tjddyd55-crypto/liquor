import { Outlet, useLocation } from 'react-router-dom'
import { AppExitConfirm } from './components/AppExitConfirm'
import { ElectronTitleBar } from './components/ElectronTitleBar'
import { WebProgramTopBar } from './components/layout/WebProgramTopBar'
import { OperationalMessageBanner } from './components/OperationalMessageBanner'
import { GlobalBackHandlerHost } from './hooks/useGlobalBackHandler'
import { useAuth } from './features/auth/AuthProvider'
import { isElectronApp } from './lib/isElectronApp'
import { isCustomerCreateMode } from './navigation/backNavigationPolicy'
import { GaSettingsProvider } from './features/ga-settings/GaSettingsProvider'
import useIsMobile from './hooks/useIsMobile'

export function AppLayout() {
  const { isAuthenticated } = useAuth()
  const location = useLocation()
  const isMobile = useIsMobile()
  const isIntroductionRoute = location.pathname === '/introduction' || location.pathname === '/introduction/install'

  /** 고객 등록(?mode=create)은 CustomersPage ExitConfirmDialog만 사용 (네이티브·웹 이중 확인 방지) */
  const hideAppExitConfirm = isCustomerCreateMode(location.pathname, location.search ?? '')
  const hideMobileLoginTopChrome = !isAuthenticated && isMobile && location.pathname === '/login'
  const hidePublicIntroChrome = isIntroductionRoute
  const isGovernmentRoute = location.pathname.startsWith('/government')

  const rootClass = ['app-root', isAuthenticated ? 'app-root--authenticated' : ''].filter(Boolean).join(' ')

  return (
    <div className={rootClass}>
      {/*
       * Electron 에서는 로그인 여부와 무관하게 타이틀바를 노출한다.
       * 창 최소화/최대화/닫기 버튼은 비인증 상태에서도 제공되어야 하기 때문.
       * (`ElectronTitleBar` 내부의 GA 테넌트·뒤로가기 로직은 이미 비인증을 고려한다)
       */}
      {isElectronApp() && !hidePublicIntroChrome ? <ElectronTitleBar /> : null}
      {!isElectronApp() && isAuthenticated && !hidePublicIntroChrome && !isGovernmentRoute ? (
        <WebProgramTopBar />
      ) : null}
      {!hideMobileLoginTopChrome && !hidePublicIntroChrome ? <OperationalMessageBanner /> : null}
      {isAuthenticated ? <GlobalBackHandlerHost /> : null}
      {hideAppExitConfirm ? null : <AppExitConfirm />}
      <div className="main-container">
        <GaSettingsProvider>
          <Outlet />
        </GaSettingsProvider>
      </div>
    </div>
  )
}
