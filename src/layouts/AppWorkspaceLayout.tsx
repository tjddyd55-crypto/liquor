import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { FormButton } from '../components/form'
import { Button, Modal } from '../components/ui'
import ResponsiveLayout from '../components/ResponsiveLayout'
import PCHeader from '../components/layout/PCHeader'
import { useAuth } from '../features/auth/AuthProvider'
import GovernmentInsuranceRouteGuard from '../features/government-support/routes/GovernmentInsuranceRouteGuard'
import { formatGaBannerLabel, shouldShowGaTenantChrome } from '../navigation/gaTenantBarShared'
import { buildAppMenuForSession } from '../features/dashboard/gaTenantMenu'
import { ExpiredBanner } from '../features/subscription/components/ExpiredBanner'
import PlatformModeSwitcher from '../features/platform/components/PlatformModeSwitcher'
import { MemoWorkspaceProvider, useMemoWorkspace } from '../features/memo/context/MemoWorkspaceContext'
import { fetchTeamMembers } from '../features/team/api/teamApi'
import MemoPanel from './MemoPanel'
import { MemoElectronFabDock } from '../features/memo/components/MemoElectronFabDock'
import { MemoMobileFab } from '../features/memo/components/MemoMobileFab'
import useIsMobile from '../hooks/useIsMobile'
import { useBackButtonClose } from '../hooks/useBackButtonClose'

const MEMO_DEFAULT_WIDTH = 420
const MEMO_MIN_WIDTH = 320
const MEMO_MAX_WIDTH_FALLBACK = 1920

function isActivePath(pathname: string, itemPath: string): boolean {
  if (itemPath === '/contacts') {
    return pathname === '/contacts' || pathname === '/insurance/contacts'
  }
  if (itemPath === '/insurance/contacts') {
    return pathname === '/insurance/contacts' || pathname === '/contacts'
  }
  if (itemPath === '/portal/newsletters') {
    return pathname === '/portal/newsletters' || pathname.startsWith('/portal/newsletters/')
  }
  if (itemPath === '/portal/adjuster-news') {
    return pathname === '/portal/adjuster-news' || pathname.startsWith('/portal/adjuster-news/')
  }
  if (itemPath === '/contacts/manage') {
    return pathname === '/contacts/manage' || pathname === '/insurance/company-registry'
  }
  if (itemPath === '/insurance/company-registry') {
    return pathname === '/insurance/company-registry' || pathname.startsWith('/insurance/company-registry/')
  }
  if (itemPath.startsWith('/customers')) {
    return (
      pathname === '/customers' ||
      pathname.startsWith('/customers/') ||
      pathname.startsWith('/customer/')
    )
  }
  if (itemPath === '/application') {
    return pathname === '/application' || pathname.startsWith('/application/')
  }
  if (itemPath === '/application/documents') {
    if (pathname.startsWith('/application/documents/history')) {
      return false
    }
    return pathname === '/application/documents' || pathname.startsWith('/application/documents/')
  }
  if (itemPath === '/application/documents/history') {
    return (
      pathname === '/application/documents/history' ||
      pathname.startsWith('/application/documents/history/')
    )
  }
  if (itemPath === '/feature-request') {
    return pathname === '/feature-request' || pathname === '/feature-requests/my'
  }
  if (itemPath === '/account/reset') {
    return pathname === '/account/reset'
  }
  if (itemPath === '/profile') {
    return pathname === '/profile'
  }
  if (itemPath === '/todos') {
    return pathname === '/todos'
  }
  if (itemPath === '/notifications') {
    return pathname === '/notifications'
  }
  if (itemPath.startsWith('/internal/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  if (itemPath === '/admin/analytics') {
    return pathname === '/admin/analytics'
  }
  if (itemPath === '/admin/platform') {
    return pathname === '/admin/platform' || pathname.startsWith('/admin/platform/')
  }
  if (itemPath === '/admin/ga') {
    return pathname === '/admin/ga' || pathname === '/admin/create-ga'
  }
  if (itemPath === '/admin/delegates') {
    return pathname === '/admin/delegates' || pathname === '/admin/create-staff'
  }
  if (itemPath === '/insurer-managers') {
    return pathname === '/insurer-managers'
  }
  if (itemPath === '/loss-adjusters') {
    return pathname === '/loss-adjusters'
  }
  if (itemPath === '/insurer/news') {
    if (pathname.startsWith('/insurer/news/upload')) {
      return false
    }
    return pathname === '/insurer/news' || pathname.startsWith('/insurer/news/')
  }
  if (itemPath === '/insurer/news/upload') {
    return pathname === '/insurer/news/upload'
  }
  if (itemPath === '/adjuster/news') {
    if (pathname.startsWith('/adjuster/news/upload')) {
      return false
    }
    return pathname === '/adjuster/news' || pathname.startsWith('/adjuster/news/')
  }
  if (itemPath === '/adjuster/news/upload') {
    return pathname === '/adjuster/news/upload'
  }
  if (itemPath === '/admin/audit-logs') {
    return pathname === '/admin/audit-logs'
  }
  if (itemPath === '/insurance/insurer-sites') {
    return pathname === '/insurance/insurer-sites'
  }
  if (itemPath === '/admin/insurer-sites') {
    return pathname === '/admin/insurer-sites'
  }
  if (itemPath === '/team/manage' || itemPath === '/team/menu-settings' || itemPath === '/team/admin') {
    return pathname === '/team/members' || pathname === itemPath || pathname.startsWith('/team/members/')
  }
  if (itemPath.startsWith('/team/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  return pathname === itemPath
}

/** B안 모드 랜딩에서도 PlatformModeSwitcher 노출 (appRouter 변경 없음). */
function isPlatformAdminArea(pathname: string): boolean {
  return (
    pathname === '/admin/platform' ||
    pathname.startsWith('/admin/platform/') ||
    /^\/admin\/industry\/[^/]+/.test(pathname) ||
    /^\/admin\/tenant\/[^/]+/.test(pathname)
  )
}

function extractCustomerIdFromPath(path: string): string | null {
  const matched = path.match(/^\/(?:customers|customer)\/([^/?#]+)/)
  if (!matched?.[1]) {
    return null
  }
  return decodeURIComponent(matched[1])
}

export function PCLayout() {
  return (
    <MemoWorkspaceProvider>
      <AppWorkspaceLayoutPCShell />
    </MemoWorkspaceProvider>
  )
}

export function MobileLayout() {
  return <AppWorkspaceLayoutMobileShell />
}

/** 인증 라우트 전역: PC/모바일 레이아웃을 완전히 분리해 렌더링한다. */
export default function AppWorkspaceLayout() {
  return (
    <GovernmentInsuranceRouteGuard>
      <ResponsiveLayout PC={PCLayout} Mobile={MobileLayout} />
    </GovernmentInsuranceRouteGuard>
  )
}

function AppWorkspaceLayoutMobileShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, token, isAuthenticated } = useAuth()
  const isMobile = useIsMobile()
  const [drawerOpen, setDrawerOpen] = useState(false)

  /*
   * 모바일 뒤로가기 UX:
   *   드로어가 열린 상태에서 브라우저/하드웨어 뒤로가기 → 드로어만 닫히고 페이지 이동은 막는다.
   *   훅 내부에서 history pushState/popstate 를 모두 캡슐화하므로 여기서는 한 줄 선언만 한다.
   */
  useBackButtonClose(drawerOpen, () => setDrawerOpen(false))

  const [mobileSelectedCustomer, setMobileSelectedCustomer] = useState<string | null>(extractCustomerIdFromPath(location.pathname))
  const [mobilePageStack, setMobilePageStack] = useState<string[]>(() => [location.pathname])
  const [teamMenuManageVisible, setTeamMenuManageVisible] = useState(false)

  /*
   * Mobile 드로어 메뉴 구성.
   *
   * `buildAppMenuForSession` (gaTenantMenu.ts) 이 "대시보드 vs 드로어 vs PC 사이드바"
   * 공통 단일 진실 원천이다. 여기서 Mobile 용 옵션만 전달한다:
   *
   *   - `teamMenuManageVisible`: 팀 오너일 때만 "팀 관리" 항목을 `/team/files` 뒤에 주입.
   *
   * divider 는 드로어에서 시각적으로 의미가 약해 렌더 측에서 무시한다(아래 `if (item.type === 'divider') return null`).
   * 빌더 단계에서는 제거하지 않는다 — 대시보드와 동일한 엔트리 배열을 유지해 호출처 간 일관성을 보장한다.
   *
   * 메모 진입은 전용 FAB(`MemoMobileFab`) 로 분리되어 더 이상 드로어에 포함하지 않는다.
   */
  const sidebarItems = useMemo(() => {
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

  const tenantChrome = shouldShowGaTenantChrome(isAuthenticated, user?.gaId, location.pathname)
  const isNewsManager = user?.role === 'INSURER_MANAGER' || user?.role === 'LOSS_ADJUSTER'
  const workspaceHeaderTitle = tenantChrome && !isNewsManager
    ? formatGaBannerLabel(user?.gaName ?? '', user?.gaCode ?? '')
    : '업무 메뉴'
  const mobileTopbarTitle = (user?.gaName ?? '').trim() || workspaceHeaderTitle || '영진 SGA'

  const pushMobilePage = useCallback((path: string) => {
    setMobilePageStack((prev) => {
      if (prev[prev.length - 1] === path) {
        return prev
      }
      return [...prev, path]
    })
  }, [])

  return (
    <div className="mobile-root mobile-workspace-layout">
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
          <div className="title">{mobileTopbarTitle}</div>
        </header>
      ) : null}

      {isPlatformAdminArea(location.pathname) && token?.trim() ? (
        <div className="platform-mode-switcher-host platform-mode-switcher-host--mobile">
          <PlatformModeSwitcher token={token} />
        </div>
      ) : null}

      {/*
       * 오버레이 드로어:
       *   - 과거에는 `<nav>` 를 `<main>` 앞에 인라인으로 렌더해 본문이 드로어 만큼
       *     아래로 밀리는 회귀가 있었다. (브라우저가 기본 block flow 로 배치)
       *   - 드로어는 "현재 보던 페이지 위에 떠 있는 네비" 여야 한다는 요구사항
       *     (모바일 앱 UX 관행) 을 만족하도록 `position: fixed` + backdrop 구조로
       *     전환한다. 본문 DOM 은 건드리지 않고 드로어가 topbar 아래부터 화면 위에 떠
       *     있으며, backdrop 을 터치하면 드로어가 닫힌다.
       *   - CSS 는 `.mobile-workspace-drawer--overlay` / `.mobile-workspace-drawer-backdrop`
       *     스코프에서 일괄 관리한다 (src/index.css).
       */}
      {drawerOpen ? (
        <div
          className="mobile-workspace-drawer-backdrop"
          role="presentation"
          aria-hidden
          onClick={() => setDrawerOpen(false)}
        />
      ) : null}

      {drawerOpen ? (
        /*
         * 모바일 드로어 = [스크롤되는 메뉴 nav] + [하단 고정 footer]
         *
         * 과거에는 `<nav>` 하나에 메뉴 항목과 로그아웃을 함께 넣어서 "로그아웃이
         * 내정보 섹션 마지막 아이템 옆에 끼어 보이는" 회귀가 있었다. 구조가 한 바구니
         * 라서 CSS 로만 하단 고정을 흉내내도 섹션 소속인지 footer 인지 DOM 수준에서
         * 구분되지 않아 회귀가 되돌아왔다.
         *
         * 해결: outer 를 `<div>` 컨테이너로 두고 안에 (a) 메뉴 전담 `<nav>` · (b)
         * 세션 액션 전담 `<div class="...__footer">` 를 물리적으로 분리.
         *   - nav 는 스크롤 담당(flex:1; overflow-y:auto)
         *   - footer 는 로그아웃 같은 "메뉴 외 액션" 전용. 앞으로 여러 액션이
         *     늘어나도 이 슬롯에만 추가하면 되고 섹션 구분이 깨지지 않는다.
         *
         * aria-label 은 내부 `<nav>` 가 소유한다(의미의 주체).
         */
        <div
          className="mobile-workspace-drawer mobile-workspace-drawer--overlay"
          role="presentation"
        >
          <nav className="mobile-workspace-drawer__nav" aria-label="모바일 주요 메뉴">
            {sidebarItems.map((item, index) => {
              if (item.type === 'divider') {
                return null
              }
              if (item.type === 'section') {
                return (
                  <div
                    key={`mobile-drawer-section-${index}`}
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
                isActivePath(location.pathname, item.path)
              return (
                <FormButton
                  key={`${item.path}-${item.label}-${index}`}
                  htmlType="button"
                  variant="secondary"
                  className={`workspace-sidebar__menu-item${isActive ? ' workspace-sidebar__menu-item--active' : ''}`}
                  disabled={isDisabled}
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => {
                    /* 개발중 항목은 클릭 비활성 (alert 없음 · 배지 라벨로만 표시) */
                    if (isDisabled) {
                      return
                    }
                    if (!item.path.trim() || item.path === '#') {
                      return
                    }
                    const nextCustomerId = extractCustomerIdFromPath(item.path)
                    setMobileSelectedCustomer(nextCustomerId)
                    pushMobilePage(item.path)
                    navigate(item.path)
                    setDrawerOpen(false)
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
                logout()
                navigate('/login', { replace: true })
              }}
            >
              로그아웃
            </FormButton>
          </div>
        </div>
      ) : null}

      <main
        className="mobile-workspace-content content-wrapper content-wrapper--mobile"
        data-selected-customer={mobileSelectedCustomer ?? ''}
        data-page-stack-depth={String(mobilePageStack.length)}
      >
        <ExpiredBanner />
        <Outlet />
      </main>

      {/*
       * 메모 진입 FAB — 모바일 전용, 화면 우측 하단 1/3 지점에 고정.
       * `/memo` 경로에서는 내부에서 자기 자신을 숨긴다. (MemoMobileFab 참조)
       */}
      <MemoMobileFab />
    </div>
  )
}

function AppWorkspaceLayoutPCShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isAuthenticated, token } = useAuth()
  const { isMinimized, setIsMinimized } = useMemoWorkspace()
  const workspaceChromeHeaderRef = useRef<HTMLElement>(null)

  const [isMemoOpen, setIsMemoOpen] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isListOpen, setIsListOpen] = useState(true)
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [preparingNoticeOpen, setPreparingNoticeOpen] = useState(false)
  const [memoWidth, setMemoWidth] = useState(MEMO_DEFAULT_WIDTH)
  const [resizeSession, setResizeSession] = useState<{ startX: number; startWidth: number } | null>(null)

  const onSelectNoteFromList = useCallback((id: string) => {
    setSelectedNoteId(id)
  }, [])

  const onToggleFullscreen = useCallback(() => {
    setIsFullscreen((v) => {
      const next = !v
      if (next) {
        setIsMemoOpen(true)
      }
      return next
    })
  }, [])

  const onToggleMinimize = useCallback(() => {
    setIsMemoOpen(true)
    setIsMinimized((prev) => {
      const next = !prev
      if (next) {
        setIsFullscreen(false)
      }
      return next
    })
  }, [setIsMinimized])

  useEffect(() => {
    if (isFullscreen) {
      setIsMinimized(false)
    }
  }, [isFullscreen, setIsMinimized])

  const clampMemoWidth = useCallback((nextWidth: number) => {
    const viewportMax =
      typeof window !== 'undefined'
        ? Math.max(MEMO_MIN_WIDTH, document.documentElement?.clientWidth || MEMO_MAX_WIDTH_FALLBACK)
        : MEMO_MAX_WIDTH_FALLBACK
    if (nextWidth < MEMO_MIN_WIDTH) {
      return MEMO_MIN_WIDTH
    }
    if (nextWidth > viewportMax) {
      return viewportMax
    }
    return nextWidth
  }, [])

  useEffect(() => {
    if (isFullscreen) {
      return
    }
    const onResize = () => {
      setMemoWidth((prev) => clampMemoWidth(prev))
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
    }
  }, [clampMemoWidth, isFullscreen])

  const onMemoResizeStart = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      if (isFullscreen) {
        return
      }
      event.preventDefault()
      setResizeSession({ startX: event.clientX, startWidth: memoWidth })
    },
    [isFullscreen, memoWidth],
  )

  useEffect(() => {
    if (!resizeSession || isFullscreen) {
      return
    }
    const onMouseMove = (event: MouseEvent) => {
      const delta = resizeSession.startX - event.clientX
      setMemoWidth(clampMemoWidth(resizeSession.startWidth + delta))
    }
    const onMouseUp = () => {
      setResizeSession(null)
    }

    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    window.addEventListener('mouseleave', onMouseUp)

    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      window.removeEventListener('mouseleave', onMouseUp)
    }
  }, [clampMemoWidth, isFullscreen, resizeSession])

  const showMemoPanel = isMemoOpen && !isMinimized

  const tenantChrome = shouldShowGaTenantChrome(isAuthenticated, user?.gaId, location.pathname)
  const isNewsManager = user?.role === 'INSURER_MANAGER' || user?.role === 'LOSS_ADJUSTER'
  const showGaUserActions = tenantChrome && !isNewsManager
  const workspaceHeaderTitle = tenantChrome
    ? formatGaBannerLabel(user?.gaName ?? '', user?.gaCode ?? '')
    : '업무 메뉴'

  return (
    <div className="pc-root app-workspace-layout-root">
      <PCHeader
        title={workspaceHeaderTitle}
        showNotification={showGaUserActions}
        headerRef={workspaceChromeHeaderRef}
        onLogout={() => {
          logout()
          navigate('/login', { replace: true })
        }}
      />

      {isPlatformAdminArea(location.pathname) && token?.trim() ? (
        <div className="platform-mode-switcher-host platform-mode-switcher-host--pc">
          <PlatformModeSwitcher token={token} />
        </div>
      ) : null}

      <div className="workspace-root workspace-root--app-pc">
        <div className="workspace-main workspace-main--app">
          <div className="app-main-content app-main-content--workspace-outlet-host">
            <ExpiredBanner />
            <Outlet />
          </div>
        </div>
      </div>

      {!isMemoOpen ? (
        <FormButton
          htmlType="button"
          variant="action"
          className="workspace-memo-reopen"
          onClick={() => setIsMemoOpen(true)}
        >
          메모 패널 열기
        </FormButton>
      ) : null}

      {showMemoPanel ? (
        <div
          className={`workspace-memo-overlay${isFullscreen ? ' workspace-memo-overlay--fullscreen' : ''}`}
          role="complementary"
          aria-label="메모 도구"
          style={isFullscreen ? undefined : { width: `${memoWidth}px` }}
        >
          {!isFullscreen ? (
            <div
              className="workspace-memo-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="메모 너비 조절"
              onMouseDown={onMemoResizeStart}
            />
          ) : null}
          <MemoPanel
            isFullscreen={isFullscreen}
            isListOpen={isListOpen}
            onToggleList={() => setIsListOpen((v) => !v)}
            selectedNoteId={selectedNoteId}
            onSelectNoteFromList={onSelectNoteFromList}
          />
        </div>
      ) : null}

      <MemoElectronFabDock
        isMobile={false}
        onToggleMinimize={onToggleMinimize}
        onToggleFullscreen={onToggleFullscreen}
      />

      <Modal open={preparingNoticeOpen} onClose={() => setPreparingNoticeOpen(false)} ariaLabel="안내">
        <div className="text-center text-base font-medium text-[var(--text-primary)] px-2 py-2">준비중입니다.</div>
        <div className="mt-4 flex justify-center">
          <Button type="button" variant="primary" className="min-w-[88px]" onClick={() => setPreparingNoticeOpen(false)}>
            확인
          </Button>
        </div>
      </Modal>
    </div>
  )
}
