import LoginPageVersionFooter from '../../../auth/pages/Login/LoginPageVersionFooter'
import { useGovernmentLoginController } from '../../hooks/useGovernmentLoginController'
import GovernmentLoginForm from './GovernmentLoginForm'

export default function GovernmentLoginPageMobileView() {
  const controller = useGovernmentLoginController()

  return (
    <main className="auth-page auth-page--mobile-login">
      <section className="auth-login-content">
        <GovernmentLoginForm
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
