import { useMemo } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { GOVERNMENT_APP_TITLE } from '../../../config/governmentAppMeta'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import useIsMobile from '../../../hooks/useIsMobile'
import { useAuth } from '../../auth/AuthProvider'
import FormButton from '../../../components/form/FormButton'
import {
  GOVERNMENT_AGENCY_ADMIN_NAV,
  GOVERNMENT_INDUSTRY_ADMIN_NAV,
  GOVERNMENT_STAFF_NAV,
  type GovernmentAdminNavItem,
} from '../config/governmentAdminNav'
import { buildGovernmentAdminMobileMenu } from '../config/governmentAppMenu'
import GovernmentMobileWorkspaceShell from '../components/GovernmentMobileWorkspaceShell'
import { canManageGovernmentUsers, isGovernmentProgramUser } from '../lib/governmentAccess'
import { canAccessUserOwnedWorkspace } from '../lib/governmentHome'
import { useGovernmentAccess } from '../hooks/useGovernmentAccess'
import '../government-support.css'

function AdminNav({ items, className }: { items: GovernmentAdminNavItem[]; className?: string }) {
  return (
    <nav className={className} aria-label="관리 메뉴">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) =>
            `government-admin-layout__nav-link${isActive ? ' government-admin-layout__nav-link--active' : ''}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}

function useGovernmentAdminNavItems(summary: ReturnType<typeof useGovernmentAccess>['summary']) {
  return useMemo(() => {
    const items: GovernmentAdminNavItem[] = []
    const isIndustry = Boolean(summary?.isSuperAdmin || summary?.isGovernmentIndustryAdmin)
    const isAgencyAdmin = canManageGovernmentUsers(summary)
    const isStaffOnly =
      !isIndustry &&
      !isAgencyAdmin &&
      (summary?.governmentStaffTenantIds?.length ?? 0) > 0 &&
      !isGovernmentProgramUser(summary)

    if (isIndustry) {
      items.push(...GOVERNMENT_INDUSTRY_ADMIN_NAV)
    }
    if (isAgencyAdmin) {
      for (const item of GOVERNMENT_AGENCY_ADMIN_NAV) {
        if (!items.some((x) => x.to === item.to)) {
          items.push(item)
        }
      }
    }
    if (isStaffOnly) {
      for (const item of GOVERNMENT_STAFF_NAV) {
        if (!items.some((x) => x.to === item.to)) {
          items.push(item)
        }
      }
    }
    return items
  }, [summary])
}

export default function GovernmentAdminLayout() {
  useDocumentTitle(`${GOVERNMENT_APP_TITLE} · 관리`)
  const { token, logout } = useAuth()
  const { summary } = useGovernmentAccess(token)
  const isMobile = useIsMobile()
  const showWorkspaceLink = canAccessUserOwnedWorkspace(summary)
  const navItems = useGovernmentAdminNavItems(summary)
  const mobileMenuItems = useMemo(() => buildGovernmentAdminMobileMenu(summary), [summary])

  if (isMobile) {
    return (
      <main
        className={`page government-page government-admin-layout government-admin-layout--mobile ${isMobile ? 'government-page--mobile' : 'government-page--pc'}`}
      >
        <GovernmentMobileWorkspaceShell
          title="정부지원 CRM · 관리"
          menuItems={mobileMenuItems}
          onLogout={logout}
        >
          {showWorkspaceLink ? (
            <div className="government-admin-layout__mobile-workspace-link">
              <Link to="/government/my-applications">내 고객/신청</Link>
            </div>
          ) : null}
          <div className="government-admin-layout__content">
            <Outlet />
          </div>
        </GovernmentMobileWorkspaceShell>
      </main>
    )
  }

  return (
    <main
      className={`page government-page government-admin-layout ${isMobile ? 'government-page--mobile' : 'government-page--pc'}`}
    >
      <header className="government-admin-layout__header">
        <div>
          <strong className="government-admin-layout__brand">정부지원 CRM · 관리</strong>
          {showWorkspaceLink ? (
            <Link to="/government/my-applications" className="government-admin-layout__workspace-link">
              내 고객/신청
            </Link>
          ) : null}
        </div>
        <FormButton htmlType="button" variant="secondary" onClick={() => logout()}>
          로그아웃
        </FormButton>
      </header>

      <div className="government-admin-layout__body">
        <aside className="government-admin-layout__sidebar">
          <AdminNav items={navItems} className="government-admin-layout__nav" />
        </aside>
        <div className="government-admin-layout__content">
          <Outlet />
        </div>
      </div>
    </main>
  )
}
