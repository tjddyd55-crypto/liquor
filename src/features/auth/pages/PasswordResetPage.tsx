import { FormButton, FormInput } from '../../../components/form'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { normalizeKrMobile, validateKrMobileDigits } from '../../../lib/phoneNormalize'
import { requestPasswordResetCode, resetPasswordBySms } from '../services/passwordResetApi'

const CODE_TTL_SEC = 180
const RESEND_COOLDOWN_SEC = 60

export function PasswordResetPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2>(1)
  const [username, setUsername] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendLeft, setResendLeft] = useState(0)
  const [debugCodeHint, setDebugCodeHint] = useState('')

  useEffect(() => {
    if (secondsLeft <= 0) {
      return
    }
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [secondsLeft])

  useEffect(() => {
    if (resendLeft <= 0) {
      return
    }
    const t = window.setInterval(() => {
      setResendLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [resendLeft])

  const phoneDigits = normalizeKrMobile(phoneInput)

  const sendCode = useCallback(async () => {
    setErrorMessage('')
    setInfoMessage('')
    const pErr = validateKrMobileDigits(phoneDigits)
    if (pErr) {
      setErrorMessage(pErr)
      return
    }
    const u = username.trim()
    if (u.length < 3) {
      setErrorMessage('아이디를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const r = await requestPasswordResetCode({ username: u, phoneNumber: phoneDigits })
      setInfoMessage(r.message ?? '인증번호를 발급했습니다.')
      if (r.debugCode) {
        setDebugCodeHint(`(개발용) 인증번호: ${r.debugCode}`)
      } else {
        setDebugCodeHint('')
      }
      setStep(2)
      setSecondsLeft(CODE_TTL_SEC)
      setResendLeft(RESEND_COOLDOWN_SEC)
      setCode('')
    } catch (e) {
      if (e instanceof ApiError) {
        setErrorMessage(e.message)
        if (e.retryAfterSec != null) {
          setResendLeft(e.retryAfterSec)
        }
      } else {
        setErrorMessage(e instanceof Error ? e.message : '요청에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }, [phoneDigits, username])

  const onSubmitStep1 = (e: FormEvent) => {
    e.preventDefault()
    void sendCode()
  }

  const onSubmitStep2 = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMessage('')
    setInfoMessage('')
    const u = username.trim()
    const pErr = validateKrMobileDigits(phoneDigits)
    if (pErr) {
      setErrorMessage(pErr)
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage('인증번호 6자리를 입력해 주세요.')
      return
    }
    if (!newPassword || newPassword.length < 4) {
      setErrorMessage('비밀번호는 4자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    setSubmitting(true)
    try {
      await resetPasswordBySms({
        username: u,
        phoneNumber: phoneDigits,
        code: code.trim(),
        newPassword,
      })
      navigate('/login', { replace: true, state: { passwordReset: true } })
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message)
        if (err.retryAfterSec != null) {
          setResendLeft(err.retryAfterSec)
        }
      } else {
        setErrorMessage(err instanceof Error ? err.message : '처리에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const mmss = `${String(Math.floor(secondsLeft / 60)).padStart(2, '0')}:${String(secondsLeft % 60).padStart(2, '0')}`

  return (
    <main className="auth-page">
      <section className="card auth-card">
        <h1>비밀번호 재설정</h1>
        <p className="auth-description">
          가입 시 등록한 아이디와 휴대폰 번호로 본인 확인 후 새 비밀번호를 설정합니다. 관리자·담당자 계정은 이
          경로를 사용할 수 없습니다.
        </p>

        {step === 1 ? (
          <form className="auth-form" onSubmit={onSubmitStep1}>
            <label className="field">
              <span className="field__label">아이디</span>
              <FormInput
                value={username}
                onChange={(ev) => setUsername(ev.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">휴대폰 번호</span>
              <FormInput
                value={phoneInput}
                onChange={(ev) => setPhoneInput(ev.target.value)}
                inputMode="numeric"
                autoComplete="tel"
                placeholder="01012345678 또는 010-1234-5678"
                required
              />
            </label>
            {errorMessage ? <p className="status status--error">{errorMessage}</p> : null}
            {infoMessage ? <p className="status">{infoMessage}</p> : null}
            <FormButton className="button button--primary button--full" htmlType="submit" disabled={submitting}>
              {submitting ? '요청 중…' : '인증번호 요청'}
            </FormButton>
          </form>
        ) : (
          <form className="auth-form" onSubmit={(e) => void onSubmitStep2(e)}>
            <p className="auth-notice" role="status">
              인증번호 유효 시간 {mmss} (3분 이내 입력){secondsLeft === 0 ? ' — 만료되었습니다. 다시 요청하세요.' : ''}
            </p>
            <label className="field">
              <span className="field__label">인증번호 6자리</span>
              <FormInput
                value={code}
                onChange={(ev) => setCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">새 비밀번호</span>
              <FormInput
                type="password"
                value={newPassword}
                onChange={(ev) => setNewPassword(ev.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            <label className="field">
              <span className="field__label">새 비밀번호 확인</span>
              <FormInput
                type="password"
                value={confirmPassword}
                onChange={(ev) => setConfirmPassword(ev.target.value)}
                autoComplete="new-password"
                required
              />
            </label>
            {debugCodeHint ? (
              <p className="status" role="note">
                {debugCodeHint}
              </p>
            ) : null}
            {errorMessage ? <p className="status status--error">{errorMessage}</p> : null}
            {infoMessage ? <p className="status">{infoMessage}</p> : null}
            <FormButton
              className="button button--primary button--full"
              htmlType="submit"
              disabled={submitting || secondsLeft === 0}
            >
              {submitting ? '처리 중…' : '비밀번호 재설정'}
            </FormButton>
            <FormButton
              htmlType="button"
              className="button button--secondary button--full"
              disabled={submitting || resendLeft > 0 || secondsLeft === 0}
              onClick={() => void sendCode()}
            >
              {resendLeft > 0 ? `재전송 (${resendLeft}초)` : '인증번호 재전송'}
            </FormButton>
            <FormButton
              htmlType="button"
              className="button button--secondary button--full"
              onClick={() => {
                setStep(1)
                setSecondsLeft(0)
                setErrorMessage('')
                setInfoMessage('')
              }}
            >
              이전 단계
            </FormButton>
          </form>
        )}

        <div className="switch-text">
          <Link to="/login" className="switch-text__action">
            로그인으로
          </Link>
        </div>
      </section>
    </main>
  )
}
