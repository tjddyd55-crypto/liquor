import { Link } from 'react-router-dom'

/**
 * [PC 전용 View] /memo 라우트 — PC 브라우저·Electron 화면.
 *
 * 이 View 의 책임: PC UI 마크업 + PC 전용 className 부착만.
 * PC 레이아웃에서는 `AppWorkspaceLayout` 이 우측에 메모 패널을 상시 렌더하므로
 * 여기서는 좌측 main 영역에 "업무 영역" placeholder 만 그린다.
 *
 *  - 라우팅·분기:   ../MemoRoutePage.tsx (container)
 *  - 모바일 대응:   ./MemoRouteMobileView.tsx
 *  - 메모 UI·상태:  features/memo/** (본 View 는 메모 자체를 렌더하지 않음)
 *
 * 스타일 조정은 src/index.css 의 `.memo-route-page--pc` 스코프에서 한다.
 * 이 컴포넌트 안에서 모바일 분기 (`useIsMobile` 등) 를 호출하지 않는다.
 */
export default function MemoRoutePCView() {
  return (
    <main className="page memo-route-page memo-route-page--pc">
      <div className="p-4 space-y-3">
        <h1 className="text-lg font-bold">업무 영역</h1>
        <p className="text-sm text-[var(--text-muted)]">
          메모는 화면 우측 패널에서 항상 사용할 수 있습니다. 다른 화면으로 이동하려면 아래 링크를 사용하세요.
        </p>
        <Link to="/dashboard" className="text-blue-400 hover:underline">
          대시보드로 이동
        </Link>
      </div>
    </main>
  )
}
