import { useLoginController } from '../../hooks/useLoginController'
import LoginForm from './LoginForm'
import LoginPageVersionFooter from './LoginPageVersionFooter'

/**
 * [PC View] 로그인 페이지.
 *
 * 레이아웃:
 *  - 2-column split (`auth-page--login-split`)
 *  - 좌측: Insurance CRM 브랜드 사이드바
 *  - 우측: 로그인 폼 카드
 *
 * 책임:
 *  - PC 고유의 사이드바 · split 레이아웃 렌더링
 *
 * 책임이 아닌 것:
 *  - 폼 상태 / submit 로직 → `useLoginController`
 *  - 공통 폼 마크업       → `LoginForm`
 *  - 플랫폼 분기          → `../LoginPage.tsx` container
 *
 * 이 View 는 `useIsMobile()` 을 호출하지 않는다. (§8-2 원칙 4)
 */
export default function LoginPagePCView() {
  const controller = useLoginController()

  return (
    <main className="auth-page auth-page--login-split">
      <aside className="auth-login-sidebar" aria-label="로그인 안내">
        <div className="auth-login-sidebar__inner">
          <h2 className="auth-login-sidebar__brand">Insurance CRM</h2>
          <p className="auth-login-sidebar__copy">
            고객 관리 · 상담 기록 · 파일 작업을 한 화면에서 이어서 처리합니다.
          </p>
        </div>
      </aside>

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
