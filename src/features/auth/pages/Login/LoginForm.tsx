import { Link } from 'react-router-dom'
import { FormButton, FormInput } from '../../../../components/form'
import type { UseLoginControllerResult } from '../../hooks/useLoginController'

/**
 * [View 공용] 로그인 폼 카드.
 *
 * PCView(사이드바 + 카드), MobileView(카드만) 가 공통으로 소비하는 UI 단위.
 * 폼 마크업이 두 플랫폼에서 완전히 동일하기 때문에 중복을 막고자 별도 컴포넌트로 추출했다.
 *
 * 책임:
 *  - 폼 필드(아이디 / 비밀번호), 에러 표시, 로그인 버튼
 *  - flash 상태에 따른 안내 배너
 *  - 회원가입 · 비밀번호 재설정 링크
 *
 * 책임이 아닌 것:
 *  - 폼 상태나 submit 로직  → `useLoginController`
 *  - 좌측 사이드바 / 외곽 레이아웃 → `LoginPagePCView` · `LoginPageMobileView`
 *
 * 이 컴포넌트는 `useIsMobile()` 을 호출하지 않는다. (§8-2 원칙 5)
 */
type LoginFormProps = Pick<
  UseLoginControllerResult,
  | 'username'
  | 'password'
  | 'errorMessage'
  | 'isSubmitting'
  | 'flash'
  | 'setUsername'
  | 'setPassword'
  | 'handleSubmit'
>

export default function LoginForm({
  username,
  password,
  errorMessage,
  isSubmitting,
  flash,
  setUsername,
  setPassword,
  handleSubmit,
}: LoginFormProps) {
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
          계정이 초기화되었습니다. 서비스 이용이 필요하면 소속 GA에 새 계정 발급을 요청해 주세요.
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
        <Link to="/register" className="switch-text__action">
          회원가입
        </Link>
      </div>

      <div className="switch-text">
        비밀번호를 잊으셨나요?
        <Link to="/password-reset" className="switch-text__action">
          비밀번호 재설정
        </Link>
      </div>
    </section>
  )
}
