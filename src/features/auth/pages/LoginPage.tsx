import ResponsiveLayout from '../../../components/ResponsiveLayout'
import LoginPageMobileView from './Login/LoginPageMobileView'
import LoginPagePCView from './Login/LoginPagePCView'

/**
 * [Container] 로그인 페이지.
 *
 * 책임:
 *  - PC/Mobile 분기를 공용 `ResponsiveLayout` 에 위임한다.
 *
 * 책임이 아닌 것:
 *  - 폼 상태·로그인 API:    ../hooks/useLoginController.ts
 *  - PC 레이아웃(브랜드 사이드바): ./Login/LoginPagePCView.tsx
 *  - Mobile 레이아웃:              ./Login/LoginPageMobileView.tsx
 *  - 공통 폼 마크업:               ./Login/LoginForm.tsx
 *  - 버전 표기:                    ./Login/LoginPageVersionFooter.tsx
 *
 * 이 컨테이너는 `useIsMobile()` 을 직접 호출하지 않는다. (§8-2 원칙 1)
 * 같은 이유로 ResponsiveLayout 외의 새 분기 추상화(ResponsiveSwitch 등)도 만들지 않는다.
 *
 * named export 유지: `appRouter.tsx` 가 `import { LoginPage }` 로 소비한다.
 *
 * 관련 규칙: AGENTS.md §8, .cursor/rules/ui-pc-mobile-separation.mdc
 */
export function LoginPage() {
  return <ResponsiveLayout PC={LoginPagePCView} Mobile={LoginPageMobileView} />
}
