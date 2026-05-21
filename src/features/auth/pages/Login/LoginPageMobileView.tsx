import { useLoginController } from '../../hooks/useLoginController'
import LoginForm from './LoginForm'
import LoginPageVersionFooter from './LoginPageVersionFooter'

/**
 * [Mobile View] 로그인 페이지.
 *
 * 레이아웃:
 *  - 단일 컬럼 (`auth-page--mobile-login`)
 *  - 사이드바 없이 로그인 폼 카드만 중앙 정렬
 *
 * 책임:
 *  - Mobile 고유의 외곽 레이아웃 렌더링
 *
 * 책임이 아닌 것:
 *  - 폼 상태 / submit 로직 → `useLoginController`
 *  - 공통 폼 마크업       → `LoginForm`
 *  - 플랫폼 분기          → `../LoginPage.tsx` container
 *
 * 이 View 는 `useIsMobile()` 을 호출하지 않는다. (§8-2 원칙 4)
 */
export default function LoginPageMobileView() {
  const controller = useLoginController()

  return (
    <main className="auth-page auth-page--mobile-login">
      <section className="auth-login-content">
        <LoginForm
          username={controller.username}
          password={controller.password}
          errorMessage={controller.errorMessage}
          isSubmitting={controller.isSubmitting}
          flash={controller.flash}
          setUsername={controller.setUsername}
          setPassword={controller.setPassword}
          handleSubmit={controller.handleSubmit}
        />
      </section>

      <LoginPageVersionFooter version={controller.version} />
    </main>
  )
}
