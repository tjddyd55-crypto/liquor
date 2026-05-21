import { useEffect, useMemo, useState, type RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { FormButton } from '../form'
import { useAuth } from '../../features/auth/AuthProvider'
import { buildAppMenuForSession, type GaTenantDashboardMenuEntry } from '../../features/dashboard/gaTenantMenu'
import { fetchTeamMembers } from '../../features/team/api/teamApi'
import { NotificationBell } from '../../features/notification/components/NotificationBell'
import { isActivePcNavigationPath } from './pcNavigationUtils'
import './pc-top-navigation.css'

type LinkEntry = Extract<GaTenantDashboardMenuEntry, { type: 'link' }>

type MenuGroup = {
  label: string
  items: LinkEntry[]
}

type Props = {
  showNotification?: boolean
  notificationBoundaryRef?: RefObject<HTMLElement | null>
  onLogout?: () => void
}

function buildMenuGroups(entries: GaTenantDashboardMenuEntry[]): MenuGroup[] {
  const groups: MenuGroup[] = []
  let currentGroup: MenuGroup | null = null

  for (const entry of entries.filter(Boolean)) {
    if (entry.type === 'divider') {
      continue
    }
    if (entry.type === 'section') {
      currentGroup = { label: entry.label, items: [] }
      groups.push(currentGroup)
      continue
    }
    if (!currentGroup) {
      currentGroup = { label: '메뉴', items: [] }
      groups.push(currentGroup)
    }
    currentGroup.items.push(entry)
  }

  return groups.filter((group) => group.items.length > 0)
}

export default function PCTopNavigation({
  showNotification = false,
  notificationBoundaryRef,
  onLogout,
}: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, token } = useAuth()
  const [teamMenuManageVisible, setTeamMenuManageVisible] = useState(false)
  const [openGroupLabel, setOpenGroupLabel] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      if (!token?.trim() || !user?.id) {
        setTeamMenuManageVisible(false)
        return
      }
      if (user?.role !== 'USER' && user?.role !== 'GA_ADMIN') {
        setTeamMenuManageVisible(false)
        return
      }
      if (!user?.teamId?.trim()) {
        setTeamMenuManageVisible(false)
        return
      }
      void fetchTeamMembers(token)
        .then((data) => {
          if (cancelled) {
            return
          }
          const ownerId = data.ownerId?.trim() ?? ''
          setTeamMenuManageVisible(Boolean(ownerId && ownerId === user?.id))
        })
        .catch(() => {
          if (!cancelled) {
            setTeamMenuManageVisible(false)
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [token, user?.id, user?.role, user?.teamId])

  const items = useMemo(() => {
    return buildAppMenuForSession(user?.role, user?.gaCode, user?.gaName, {
      teamMenuManageVisible,
      subscriptionExpired: user?.subscription?.effectiveStatus === 'EXPIRED',
      crmIndustryCode: user?.crmIndustryCode ?? null,
    })
  }, [
    teamMenuManageVisible,
    user?.role,
    user?.gaCode,
    user?.gaName,
    user?.crmIndustryCode,
    user?.subscription?.effectiveStatus,
  ])

  const groups = useMemo(() => buildMenuGroups(items), [items])
  const activeGroup = useMemo(() => {
    return groups.find((group) =>
      group.items.some((item) =>
        !item.disabled &&
        !item.preparing &&
        item.path.trim() !== '' &&
        item.path !== '#' &&
        isActivePcNavigationPath(location.pathname, item.path),
      ),
    )
  }, [groups, location.pathname])
  const openGroup = openGroupLabel
    ? groups.find((group) => group.label === openGroupLabel) ?? null
    : null

  return (
    <nav
      className="pc-top-navigation pc-top-navigation--dropdown"
      aria-label="PC 상단 주요 메뉴"
      onMouseLeave={() => setOpenGroupLabel(null)}
      onBlur={(event) => {
        const nextFocusTarget = event.relatedTarget as Node | null
        if (!nextFocusTarget || !event.currentTarget.contains(nextFocusTarget)) {
          setOpenGroupLabel(null)
        }
      }}
    >
      <div className="pc-top-navigation__bar">
        <div className="pc-top-navigation__groups" role="menubar" aria-label="PC 업무 대분류 메뉴">
          {groups.map((group) => {
            const isActive = activeGroup?.label === group.label
            const isOpen = openGroup?.label === group.label
            return (
              <button
                key={group.label}
                type="button"
                className={`pc-top-navigation__group${isActive ? ' pc-top-navigation__group--active' : ''}${isOpen ? ' pc-top-navigation__group--open' : ''}`}
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onMouseEnter={() => setOpenGroupLabel(group.label)}
                onFocus={() => setOpenGroupLabel(group.label)}
              >
                {group.label}
              </button>
            )
          })}
        </div>

        <div className="pc-top-navigation__actions" aria-label="PC 상단 액션">
          {showNotification ? (
            <NotificationBell variant="workspaceHeader" boundaryRef={notificationBoundaryRef} />
          ) : null}
          {onLogout ? (
            <FormButton
              htmlType="button"
              variant="secondary"
              className="pc-top-navigation__logout"
              onClick={onLogout}
            >
              로그아웃
            </FormButton>
          ) : null}
        </div>
      </div>

      {openGroup ? (
        <div className="pc-top-navigation__dropdown" role="menu" aria-label={`${openGroup.label} 하위 메뉴`}>
          <div className="pc-top-navigation__dropdown-items">
            {openGroup.items.map((item, index) => {
              const isDisabled = Boolean(item.disabled || item.preparing)
              const isActive =
                !isDisabled &&
                item.path.trim() !== '' &&
                item.path !== '#' &&
                isActivePcNavigationPath(location.pathname, item.path)

              return (
                <FormButton
                  key={`${item.path}-${item.label}-${index}`}
                  htmlType="button"
                  variant="secondary"
                  className={`pc-top-navigation__item${isActive ? ' pc-top-navigation__item--active' : ''}`}
                  disabled={isDisabled}
                  role="menuitem"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    if (isDisabled) {
                      return
                    }
                    if (!item.path.trim() || item.path === '#') {
                      return
                    }
                    navigate(item.path)
                    setOpenGroupLabel(null)
                  }}
                >
                  <span className="pc-top-navigation__item-label">{item.label}</span>
                  {item.badge ? <span className="pc-top-navigation__item-badge">{item.badge}</span> : null}
                </FormButton>
              )
            })}
          </div>
        </div>
      ) : null}
    </nav>
  )
}
