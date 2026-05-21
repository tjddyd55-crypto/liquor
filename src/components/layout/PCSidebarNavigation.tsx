import { FormButton } from '../form'
import type { GaTenantDashboardMenuEntry } from '../../features/dashboard/gaTenantMenu'

type Props = {
  items: GaTenantDashboardMenuEntry[]
  pathname: string
  isActivePath: (pathname: string, itemPath: string) => boolean
  onNavigate: (path: string) => void
}

/**
 * PCSidebarNavigation
 *
 * PC 전용 좌측 사이드바 메뉴 렌더러.
 *
 * 책임:
 * - PC 좌측 사이드바 메뉴 UI만 렌더링한다.
 * - 메뉴 데이터는 gaTenantMenu.ts에서 생성된 items를 그대로 받는다.
 * - active 판정은 외부에서 받은 isActivePath를 사용한다.
 * - 실제 라우팅은 외부에서 받은 onNavigate를 호출한다.
 *
 * 하지 않는 일:
 * - 모바일 드로어를 렌더링하지 않는다.
 * - 메뉴 데이터를 직접 생성하지 않는다.
 * - 로그아웃 버튼을 렌더링하지 않는다.
 * - 사이드바 열림/닫힘 상태를 관리하지 않는다.
 *
 * 분리 목적:
 * - AppWorkspaceLayout.tsx에 PC 메뉴 렌더링 코드가 계속 누적되는 것을 막는다.
 * - 디자이너/개발자가 PC 좌측 메뉴 수정 지점을 한 파일에서 찾을 수 있게 한다.
 * - PCTopNavigation과 같은 메뉴 데이터를 공유하되, 상단/좌측 UI 책임은 분리한다.
 */
export default function PCSidebarNavigation({
  items,
  pathname,
  isActivePath,
  onNavigate,
}: Props) {
  const safeItems = items.filter(Boolean)

  return (
    <nav className="workspace-sidebar__nav" aria-label="주요 메뉴">
      {safeItems.map((item, index) => {
        if (item.type === 'divider') {
          return <div key={`workspace-divider-${index}`} className="workspace-sidebar__divider" role="presentation" />
        }
        if (item.type === 'section') {
          return (
            <div
              key={`workspace-section-${index}`}
              className="workspace-sidebar__section"
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
          isActivePath(pathname, item.path)

        return (
          <FormButton
            key={`${item.path}-${item.label}-${index}`}
            htmlType="button"
            variant="secondary"
            className={`workspace-sidebar__menu-item${isActive ? ' workspace-sidebar__menu-item--active' : ''}`}
            disabled={isDisabled}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              if (isDisabled) {
                return
              }
              if (!item.path.trim() || item.path === '#') {
                return
              }
              onNavigate(item.path)
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
  )
}
