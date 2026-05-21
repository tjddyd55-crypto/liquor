import { type RefObject } from 'react'
import PCTopNavigation from './PCTopNavigation'

type Props = {
  title: string
  showNotification: boolean
  headerRef: RefObject<HTMLElement | null>
  onLogout?: () => void
}

/**
 * PCHeader
 *
 * PC 전용 업무 헤더 shell.
 *
 * 현재 PC 메뉴 정책:
 * - GA/회사명은 ElectronTitleBar 같은 PC 프로그램 최상단 타이틀 영역에서 표시한다.
 * - 실제 업무 메뉴는 PCTopNavigation이 담당한다.
 * - 알림/로그아웃은 PCTopNavigation 우측 actions 영역에 고정한다.
 *
 * 하지 않는 일:
 * - 모바일 상단바를 렌더링하지 않는다.
 * - 좌측 사이드바 메뉴를 렌더링하지 않는다.
 * - 별도의 제목 row를 렌더링하지 않는다.
 */
export default function PCHeader({
  showNotification,
  headerRef,
  onLogout,
}: Props) {
  return (
    <header
      ref={headerRef}
      className="app-workspace-chrome-header header pc-workspace-header pc-workspace-header--navigation-only"
      aria-label="PC 워크스페이스 상단 메뉴"
    >
      <PCTopNavigation
        showNotification={showNotification}
        notificationBoundaryRef={headerRef}
        onLogout={onLogout}
      />
    </header>
  )
}
