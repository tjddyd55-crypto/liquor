import { Link } from 'react-router-dom'
import { FormButton, FormInput } from '../../../../components/form'
import type { UseGovernmentLoginControllerResult } from '../../hooks/useGovernmentLoginController'

type GovernmentLoginFormProps = Pick<
  UseGovernmentLoginControllerResult,
  | 'username'
  | 'password'
  | 'errorMessage'
  | 'isSubmitting'
  | 'flash'
  | 'setUsername'
  | 'setPassword'
  | 'handleSubmit'
>

export default function GovernmentLoginForm({
  username,
  password,
  errorMessage,
  isSubmitting,
  flash,
  setUsername,
  setPassword,
  handleSubmit,
}: GovernmentLoginFormProps) {
  return (
    <section className="card auth-card auth-card--login-split">
      <h1>로그인</h1>

      {flash.passwordReset ? (
        <p className="auth-notice" role="status">
          비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요.
        </p>
      ) : null}
      {flash.accountReset ? (
        <p className="auth-notice" role="status">
          계정이 초기화되었습니다. 서비스 이용이 필요하면 소속 기관에 새 계정 발급을 요청해 주세요.
        </p>
      ) : null}

      <form className="auth-form" style={{ marginTop: '1rem' }} onSubmit={handleSubmit}>
        <label className="field">
          <span className="field__label">아이디</span>
          <FormInput
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            inputMode="text"
            required
          />
        </label>

        <label className="field">
          <span className="field__label">비밀번호</span>
          <FormInput
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {errorMessage ? <p className="status status--error">{errorMessage}</p> : null}

        <FormButton
          className="button button--primary button--full"
          htmlType="submit"
          variant="primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? '로그인 중...' : '로그인'}
        </FormButton>
      </form>

      <div className="switch-text">
        계정이 없으신가요?
        <Link to="/government/signup" className="switch-text__action">
          회원가입
        </Link>
      </div>

      <div className="switch-text">
        가입 코드가 있으신가요?
        <Link to="/government/join" className="switch-text__action">
          코드로 가입
        </Link>
      </div>
    </section>
  )
}
