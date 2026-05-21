import { NavLink, Outlet } from 'react-router-dom'
import { GOVERNMENT_APP_TITLE } from '../../../config/governmentAppMeta'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import useIsMobile from '../../../hooks/useIsMobile'
import { useAuth } from '../../auth/AuthProvider'
import FormButton from '../../../components/form/FormButton'
import { GOVERNMENT_USER_NAV } from '../config/governmentUserNav'
import { buildGovernmentUserMobileMenu } from '../config/governmentAppMenu'
import GovernmentMobileWorkspaceShell from '../components/GovernmentMobileWorkspaceShell'
import '../government-support.css'

function UserNav({ className }: { className?: string }) {
  return (
    <nav className={className} aria-label="이용자 메뉴">
      {GOVERNMENT_USER_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `government-user-layout__nav-link${isActive ? ' government-user-layout__nav-link--active' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function GovernmentUserLayout() {
  useDocumentTitle(GOVERNMENT_APP_TITLE)
  const { logout } = useAuth()
  const isMobile = useIsMobile()
  const mobileMenuItems = buildGovernmentUserMobileMenu()

  if (isMobile) {
    return (
      <main
        className={`page government-page government-user-layout government-user-layout--mobile ${isMobile ? 'government-page--mobile' : 'government-page--pc'}`}
      >
        <GovernmentMobileWorkspaceShell
          title="정부지원 CRM"
          menuItems={mobileMenuItems}
          onLogout={logout}
        >
          <div className="government-user-layout__content">
            <Outlet />
          </div>
        </GovernmentMobileWorkspaceShell>
      </main>
    )
  }

  return (
    <main
      className={`page government-page government-user-layout ${isMobile ? 'government-page--mobile' : 'government-page--pc'}`}
    >
      <header className="government-user-layout__header">
        <strong className="government-user-layout__brand">정부지원 CRM</strong>
        <FormButton htmlType="button" variant="secondary" onClick={() => logout()}>
          로그아웃
        </FormButton>
      </header>

      <div className="government-user-layout__body">
        <aside className="government-user-layout__sidebar">
          <UserNav className="government-user-layout__nav" />
        </aside>
        <div className="government-user-layout__content">
          <Outlet />
        </div>
      </div>
    </main>
  )
}
