import { useNavigate } from 'react-router-dom'
import type { GaTenantDashboardMenuEntry } from '../../dashboard/gaTenantMenu'
import FormButton from '../../../components/form/FormButton'
import { isGovernmentMobileMenuPathActive } from '../config/governmentAppMenu'

type GovernmentMobileWorkspaceDrawerProps = {
  open: boolean
  pathname: string
  items: GaTenantDashboardMenuEntry[]
  onClose: () => void
  onLogout: () => void
  logoutRedirectPath?: string
}

export default function GovernmentMobileWorkspaceDrawer({
  open,
  pathname,
  items,
  onClose,
  onLogout,
  logoutRedirectPath = '/government/login',
}: GovernmentMobileWorkspaceDrawerProps) {
  const navigate = useNavigate()

  if (!open) {
    return null
  }

  return (
    <>
      <div
        className="mobile-workspace-drawer-backdrop"
        role="presentation"
        aria-hidden
        onClick={onClose}
      />
      <div className="mobile-workspace-drawer mobile-workspace-drawer--overlay" role="presentation">
        <nav className="mobile-workspace-drawer__nav" aria-label="모바일 주요 메뉴">
          {items.map((item, index) => {
            if (item.type === 'divider') {
              return null
            }
            if (item.type === 'section') {
              return (
                <div
                  key={`gov-drawer-section-${index}`}
                  className="mobile-workspace-drawer__section"
                  role="presentation"
                >
                  {item.label}
                </div>
              )
            }
            const isDisabled = Boolean(item.disabled || item.preparing)
            const isActive =
              !isDisabled &&
              item.path.trim() !== '' &&
              item.path !== '#' &&
              isGovernmentMobileMenuPathActive(pathname, item.path)
            return (
              <FormButton
                key={`${item.path}-${item.label}-${index}`}
                htmlType="button"
                variant="secondary"
                className={`workspace-sidebar__menu-item${isActive ? ' workspace-sidebar__menu-item--active' : ''}`}
                disabled={isDisabled}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  if (isDisabled || !item.path.trim() || item.path === '#') {
                    return
                  }
                  navigate(item.path)
                  onClose()
                }}
              >
                <span className="workspace-sidebar__menu-item-label">{item.label}</span>
                {item.badge ? (
                  <span className="workspace-sidebar__menu-item-badge">{item.badge}</span>
                ) : null}
              </FormButton>
            )
          })}
        </nav>
        <div className="mobile-workspace-drawer__footer" role="presentation">
          <FormButton
            htmlType="button"
            variant="secondary"
            className="mobile-workspace-drawer__logout"
            onClick={() => {
              onLogout()
              navigate(logoutRedirectPath, { replace: true })
            }}
          >
            로그아웃
          </FormButton>
        </div>
      </div>
    </>
  )
}
