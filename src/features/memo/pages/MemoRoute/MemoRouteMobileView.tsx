import { Link } from 'react-router-dom'
import MainWorkspaceLayout from '../../../../layouts/MainWorkspaceLayout'

/**
 * [Mobile 전용 View] /memo 라우트 — 모바일 기기 화면.
 *
 * ## 설계
 *
 * 분리 전(`MemoRoutePage` 단일 파일 시점) 모바일 렌더와 **마크업 1:1 동일**하게
 * 유지한다. 당시 코드:
 *
 * ```tsx
 * <div className="memo-route-page">
 *   <MainWorkspaceLayout>...</MainWorkspaceLayout>
 * </div>
 * ```
 *
 * ## 왜 `--mobile` modifier 를 붙이지 않는가
 *
 * 일반 페이지에는 `--mobile` modifier 를 부착해 플랫폼별 CSS 분기를 가능하게
 * 한다 (ui-pc-mobile-separation §2). 그러나 `/memo` 는 다음 두 가지가 겹친다:
 *
 *   1. 하위 `MainWorkspaceLayout` 이 자체 `workspace-root` flex 컨테이너를
 *      들고 있어, 상위 `.memo-route-page` 에 modifier 기반 추가 스타일을 얹는 순간
 *      내부 flex 높이 계산이 어긋날 위험이 크다 (과거 회귀 사례).
 *   2. 분리 전 모바일 화면과 **완벽히 동일한** 렌더가 요구사항이다.
 *
 * 따라서 이 화면은 "공용 스캐폴딩을 타지 않는 예외 케이스" 로 두고, modifier
 * 없이 `.memo-route-page` 공통 스타일에만 의존한다. PC 쪽은 `--pc` modifier 로
 * 상위 레이아웃 차이(`AppWorkspaceLayout` 안의 고정 높이)만 보정한다.
 *
 * ## 관련 파일
 *
 *  - 라우팅·분기:  ../MemoRoutePage.tsx (container, `ResponsiveLayout` 사용)
 *  - PC 대응:      ./MemoRoutePCView.tsx
 *  - 메모 UI·상태: features/memo/**, layouts/MainWorkspaceLayout
 *  - 스타일:       src/index.css `.memo-route-page` / `.memo-route-page--pc`
 */
export default function MemoRouteMobileView() {
  return (
    <div className="memo-route-page">
      <MainWorkspaceLayout>
        <div className="p-4 space-y-3">
          <h1 className="text-lg font-bold">업무 영역</h1>
          <p className="text-sm text-[var(--text-muted)]">
            우측에서 메모를 사용합니다. 다른 화면으로 이동하려면 아래 링크를 사용하세요.
          </p>
          <Link to="/dashboard" className="text-blue-400 hover:underline">
            대시보드로 이동
          </Link>
        </div>
      </MainWorkspaceLayout>
    </div>
  )
}
