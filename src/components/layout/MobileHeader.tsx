import { type RefObject } from 'react'
import { FormButton } from '../form'
import { NotificationBell } from '../../features/notification/components/NotificationBell'

type Props = {
  title: string
  drawerOpen: boolean
  showNotification: boolean
  headerRef: RefObject<HTMLElement | null>
  onToggleDrawer: () => void
}

export default function MobileHeader({
  title,
  drawerOpen,
  showNotification,
  headerRef,
  onToggleDrawer,
}: Props) {
  return (
    <header ref={headerRef} className="mobile-workspace-header" aria-label="모바일 워크스페이스 상단">
      <div className="mobile-workspace-header__left">
        <FormButton
          htmlType="button"
          variant="secondary"
          className="menu-btn mobile-workspace-header__menu-btn"
          aria-label="메뉴 열기"
          aria-expanded={drawerOpen}
          onClick={onToggleDrawer}
        >
          ☰
        </FormButton>
        <span className="mobile-workspace-header__title">{title}</span>
      </div>
      <div className="mobile-workspace-header__right">
        {showNotification ? <NotificationBell variant="workspaceHeader" boundaryRef={headerRef} /> : null}
      </div>
    </header>
  )
}

