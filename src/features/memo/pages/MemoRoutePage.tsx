import ResponsiveLayout from '../../../components/ResponsiveLayout'
import MemoRouteMobileView from './MemoRoute/MemoRouteMobileView'
import MemoRoutePCView from './MemoRoute/MemoRoutePCView'

/**
 * [Container] /memo 라우트 페이지.
 *
 * 책임:
 *  - PC/Mobile 분기를 공용 `ResponsiveLayout` 에 위임한다.
 *
 * 책임이 아닌 것:
 *  - UI 마크업:   ./MemoRoute/MemoRoutePCView.tsx · ./MemoRoute/MemoRouteMobileView.tsx
 *  - 메모 기능:   features/memo/** (데이터·상태·컴포넌트)
 *  - 라우팅 등록: src/appRouter.tsx
 *
 * 이 페이지는 데이터 소스·권한 가드가 없는 placeholder 라서 별도 훅을 두지 않는다.
 * 향후 데이터 연동이 생기면 `useMemoRouteData` 같은 훅을 features/memo/hooks 에 추가한다.
 *
 * 관련 규칙: AGENTS.md §8, .cursor/rules/ui-pc-mobile-separation.mdc
 */
export default function MemoRoutePage() {
  return <ResponsiveLayout PC={MemoRoutePCView} Mobile={MemoRouteMobileView} />
}
