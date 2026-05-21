import type { ComponentType } from 'react'
import useIsMobile from '../hooks/useIsMobile'

/**
 * PC/Mobile View 분기 공용 추상화. (AGENTS §8-2 원칙 1 단일 진입점)
 *
 * ## 기본 사용 (props 없는 View)
 *
 *   <ResponsiveLayout PC={ExamplePCView} Mobile={ExampleMobileView} />
 *
 *   — 대부분의 페이지는 데이터·핸들러를 View 내부 훅 (`useXxxController` 등)
 *     으로 해결하므로 props 가 필요하지 않다. 이 형태가 권장된다.
 *
 * ## 확장 사용 (Container 가 View 로 props 를 주입해야 하는 경우)
 *
 *   <ResponsiveLayout<ViewProps>
 *     PC={ExamplePCView}
 *     Mobile={ExampleMobileView}
 *     viewProps={{ error, rows, onSubmit, ... }}
 *   />
 *
 *   — 같은 View 가 **다른 호출부에서도 props 기반으로 재사용**되는 경우에 사용한다.
 *     (예: `CustomerConsultationsPageMobile` 은 라우트 페이지와 고객 상세 모달
 *     두 곳에서 공유됨 → 훅 기반 자가조달로 바꾸면 모달이 깨진다.)
 *
 * ## 설계 원칙 (재확인)
 *
 *  - `ResponsiveSwitch`, `PlatformSwitch` 같은 "같은 역할의 신규 추상화" 는
 *    만들지 않는다. 개선이 필요하면 이 파일만 확장한다.
 *  - 페이지 내부의 **부분 섹션** 만 플랫폼 한정으로 표시해야 한다면
 *    `PCOnlySection` 을 사용한다 (스코프가 다르므로 중복 추상화 아님).
 *  - 여기서 `useIsMobile` 을 호출하므로, container 와 View 안에서는
 *    `useIsMobile` 을 직접 호출하지 않는다 (§8-2 원칙 4).
 *
 * ## 기존 호출부 호환성
 *
 *  - `P extends object = Record<string, never>` 기본값 덕분에
 *    `<ResponsiveLayout PC={...} Mobile={...} />` 기존 호출은 타입 변경 없이
 *    그대로 동작한다. `viewProps` 를 생략하면 `<Component />` 로 렌더된다.
 */
type ResponsiveLayoutProps<P extends object> = {
  PC: ComponentType<P>
  Mobile: ComponentType<P>
  /**
   * View 에 전달할 props. 기본값은 `undefined` 이며, 이 경우 View 는 props
   * 없이 렌더된다. 두 View 는 동일한 props 시그니처를 가져야 한다.
   */
  viewProps?: P
}

export default function ResponsiveLayout<P extends object = Record<string, never>>({
  PC,
  Mobile,
  viewProps,
}: ResponsiveLayoutProps<P>) {
  const isMobile = useIsMobile()
  const Component = isMobile ? Mobile : PC
  const props = (viewProps ?? ({} as P)) as P

  return <Component {...props} />
}
