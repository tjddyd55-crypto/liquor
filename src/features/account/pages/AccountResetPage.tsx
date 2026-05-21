import { FormButton, FormInput } from '../../../components/form'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { normalizeKrMobile, validateKrMobileDigits } from '../../../lib/phoneNormalize'
import { useAuth } from '../../auth/AuthProvider'
import { requestAccountResetCode, resetAccountBySms } from '../services/accountResetApi'

const CODE_TTL_SEC = 300
const RESEND_COOLDOWN_SEC = 60

export function AccountResetPage() {
  const navigate = useNavigate()
  const { user, token, logout } = useAuth()
  const [step, setStep] = useState<1 | 2>(1)
  const [phoneInput, setPhoneInput] = useState('')
  const [code, setCode] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendLeft, setResendLeft] = useState(0)
  const [debugCodeHint, setDebugCodeHint] = useState('')

  const phoneDigits = normalizeKrMobile(phoneInput)

  const secondsTimerActive = secondsLeft > 0
  useEffect(() => {
    if (!secondsTimerActive) {
      return
    }
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [secondsTimerActive])

  const resendTimerActive = resendLeft > 0
  useEffect(() => {
    if (!resendTimerActive) {
      return
    }
    const t = window.setInterval(() => {
      setResendLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [resendTimerActive])

  const sendCode = useCallback(async () => {
    if (!token) {
      return
    }
    setErrorMessage('')
    setInfoMessage('')
    const pErr = validateKrMobileDigits(phoneDigits)
    if (pErr) {
      setErrorMessage(pErr)
      return
    }
    setSubmitting(true)
    try {
      const r = await requestAccountResetCode(token, { phoneNumber: phoneDigits })
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
  }, [phoneDigits, token])

  if (user?.role !== 'USER') {
    return <Navigate to="/dashboard" replace />
  }

  const onSubmitStep1 = (e: FormEvent) => {
    e.preventDefault()
    void sendCode()
  }

  const onFinalize = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) {
      return
    }
    setErrorMessage('')
    setInfoMessage('')
    const pErr = validateKrMobileDigits(phoneDigits)
    if (pErr) {
      setErrorMessage(pErr)
      return
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage('인증번호 6자리를 입력해 주세요.')
      return
    }
    if (!confirmed) {
      setErrorMessage('삭제 및 초기화에 동의해야 합니다.')
      return
    }
    setSubmitting(true)
    try {
      await resetAccountBySms(token, {
        phoneNumber: phoneDigits,
        code: code.trim(),
        confirmReset: true,
      })
      logout()
      navigate('/login', { replace: true, state: { accountReset: true } })
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
        <h1>계정 및 개인 데이터 초기화</h1>
        <div className="auth-description">
          <p>
            <strong>계정을 초기화하면</strong> 등록한 고객 정보, 자동차 신청서, 기능 요청 등 본인이 생성한 데이터가
            삭제됩니다.
          </p>
          <p>삭제된 데이터는 복구할 수 없습니다. 본인 확인을 위해 휴대폰 인증이 필요합니다.</p>
          <p>완료 후에는 동일 계정으로 로그인할 수 없으며, 필요 시 GA를 통해 새 계정을 요청해야 합니다.</p>
        </div>

        {step === 1 ? (
          <form className="auth-form" onSubmit={onSubmitStep1}>
            <label className="field">
              <span className="field__label">등록 휴대폰 번호</span>
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
          <form className="auth-form" onSubmit={(e) => void onFinalize(e)}>
            <p className="auth-notice" role="status">
              인증번호 유효 시간 {mmss}
              {secondsLeft === 0 ? ' — 만료되었습니다. 다시 요청하세요.' : ''}
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
            <label className="field field--checkbox">
              <FormInput
                type="checkbox"
                checked={confirmed}
                onChange={(ev) => setConfirmed(ev.target.checked)}
              />
              <span>
                위 내용을 이해했으며, <strong>내 고객 데이터 전체 삭제 및 계정 초기화</strong>를 진행합니다.
              </span>
            </label>
            {debugCodeHint ? (
              <p className="status" role="note">
                {debugCodeHint}
              </p>
            ) : null}
            {errorMessage ? <p className="status status--error">{errorMessage}</p> : null}
            <FormButton
              className="button button--primary button--full"
              htmlType="submit"
              disabled={submitting || secondsLeft === 0 || !confirmed}
            >
              {submitting ? '처리 중…' : '계정 초기화 실행'}
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
                setConfirmed(false)
                setErrorMessage('')
                setInfoMessage('')
              }}
            >
              이전 단계
            </FormButton>
          </form>
        )}

        <div className="switch-text">
          <FormButton htmlType="button" className="switch-text__action" onClick={() => navigate('/dashboard')}>
            메뉴로 돌아가기
          </FormButton>
        </div>
      </section>
    </main>
  )
}
