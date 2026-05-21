import { useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import type { GaTenantDashboardMenuEntry } from '../../dashboard/gaTenantMenu'
import FormButton from '../../../components/form/FormButton'
import { useBackButtonClose } from '../../../hooks/useBackButtonClose'
import useIsMobile from '../../../hooks/useIsMobile'
import GovernmentMobileWorkspaceDrawer from './GovernmentMobileWorkspaceDrawer'

type GovernmentMobileWorkspaceShellProps = {
  title: string
  menuItems: GaTenantDashboardMenuEntry[]
  onLogout: () => void
  headerExtra?: ReactNode
  children: ReactNode
}

/** 보험 AppWorkspaceLayout 모바일 셸과 동일한 햄버거·드로어 UI, 정부지원 메뉴 데이터 전용 */
export default function GovernmentMobileWorkspaceShell({
  title,
  menuItems,
  onLogout,
  headerExtra,
  children,
}: GovernmentMobileWorkspaceShellProps) {
  const location = useLocation()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  useBackButtonClose(drawerOpen, () => setDrawerOpen(false))

  return (
    <div className="mobile-root mobile-workspace-layout government-mobile-workspace-shell">
      {isMobile ? (
        <header className="mobile-topbar" aria-label="모바일 상단바">
          <FormButton
            htmlType="button"
            variant="secondary"
            className="menu-btn"
            aria-label="메뉴 열기"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            ☰
          </FormButton>
          <div className="title">{title}</div>
          {headerExtra ?? null}
        </header>
      ) : null}

      <GovernmentMobileWorkspaceDrawer
        open={drawerOpen}
        pathname={location.pathname}
        items={menuItems}
        onClose={() => setDrawerOpen(false)}
        onLogout={onLogout}
      />

      <div className="mobile-workspace-content content-wrapper content-wrapper--mobile government-mobile-workspace-shell__content">
        {children}
      </div>
    </div>
  )
}
