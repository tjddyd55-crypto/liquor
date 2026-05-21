import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { FormButton, FormInput } from '../../../components/form'
import './contract-public-sign.css'
import {
  ApiError,
  fetchContractOtpStatus,
  fetchContractPublicDocuments,
  fetchContractPublicSession,
  postContractOtpSend,
  postContractOtpVerify,
  postContractPublicOpen,
  type ContractDocumentRow,
  type ContractPublicSessionPayload,
} from './contractPublicClient'

function labelForDocStatus(st: string) {
  if (st === 'completed') return '완료'
  if (st === 'viewed' || st === 'pending') return '미완료'
  return st
}

export default function ContractSignPage() {
  const { linkCode: linkCodeParam } = useParams<{ linkCode: string }>()
  const linkCode = String(linkCodeParam ?? '').trim()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [session, setSession] = useState<ContractPublicSessionPayload | null>(null)
  const [documents, setDocuments] = useState<ContractDocumentRow[] | null>(null)

  const [otpCode, setOtpCode] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpError, setOtpError] = useState('')
  const [cooldownSec, setCooldownSec] = useState(0)

  const loadSession = useCallback(async () => {
    const data = await fetchContractPublicSession(linkCode)
    setSession(data)
    return data
  }, [linkCode])

  useEffect(() => {
    if (!linkCode) {
      setError('링크 코드가 없습니다.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError('')
    void loadSession()
      .then(async () => {
        if (cancelled) return
        try {
          await postContractPublicOpen(linkCode)
        } catch {
          /* open 기록 실패는 치명적이지 않음 */
        }
      })
      .catch((e) => {
        if (cancelled) return
        setSession(null)
        setError(e instanceof ApiError ? e.message : '정보를 불러오지 못했습니다.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkCode, loadSession])

  useEffect(() => {
    if (!linkCode || !session) return
    if (session.sendSession.authenticationRequired || session.blocked || session.completed) return
    let cancelled = false
    void fetchContractPublicDocuments(linkCode)
      .then((d) => {
        if (!cancelled) setDocuments(d.documents)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [linkCode, session])

  useEffect(() => {
    if (!linkCode || !session?.sendSession.authenticationRequired) return
    let cancelled = false
    void fetchContractOtpStatus(linkCode)
      .then((st) => {
        if (cancelled || !st.verified) return
        void loadSession()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [linkCode, session?.sendSession.authenticationRequired, loadSession])

  useEffect(() => {
    if (cooldownSec <= 0) return
    const t = window.setInterval(() => {
      setCooldownSec((s) => Math.max(0, s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [cooldownSec])

  const refreshAuthorized = useCallback(async () => {
    const next = await loadSession()
    if (!next.sendSession.authenticationRequired) {
      const d = await fetchContractPublicDocuments(linkCode)
      setDocuments(d.documents)
    }
  }, [linkCode, loadSession])

  const handleSendOtp = async () => {
    setOtpError('')
    setOtpSending(true)
    try {
      await postContractOtpSend(linkCode)
      setCooldownSec(0)
    } catch (e) {
      if (e instanceof ApiError && e.status === 429 && e.retryAfterSec) {
        setCooldownSec(e.retryAfterSec)
      }
      setOtpError(e instanceof ApiError ? e.message : '인증번호를 요청하지 못했습니다.')
    } finally {
      setOtpSending(false)
    }
  }

  const otpCodeValid = /^\d{6}$/.test(otpCode)

  const handleVerify = async () => {
    setOtpError('')
    setOtpVerifying(true)
    try {
      await postContractOtpVerify(linkCode, otpCode)
      setOtpCode('')
      await refreshAuthorized()
    } catch (e) {
      setOtpError(e instanceof ApiError ? e.message : '인증에 실패했습니다.')
    } finally {
      setOtpVerifying(false)
    }
  }

  let body: ReactNode
  if (loading) {
    body = <p className="contract-public-link-page__loading">불러오는 중…</p>
  } else if (error || !session) {
    body = (
      <div className="contract-public-sign-page__panel-danger">
        <p className="font-medium">유효하지 않은 링크입니다.</p>
        <p className="mt-2 text-sm">{error || '요청을 확인할 수 없습니다.'}</p>
      </div>
    )
  } else if (session.blocked) {
    const reason = session.blockedReason
    const isCancelled = reason === 'cancelled'
    body = (
      <div className="contract-public-sign-page__panel-danger-soft">
        {isCancelled ? (
          <>
            <p className="font-medium">취소된 전자서명 요청입니다.</p>
            <p className="mt-2 text-sm">담당자에게 문의해주세요.</p>
          </>
        ) : (
          <>
            <p className="font-medium">이 링크는 더 이상 사용할 수 없습니다.</p>
            <p className="mt-2 text-sm">만료되었거나 취소된 세션입니다. 담당자에게 문의해 주세요.</p>
          </>
        )}
      </div>
    )
  } else if (session.completed) {
    body = (
      <div className="contract-public-sign-page__panel-success">
        <p className="contract-public-sign-page__panel-success-title">서명이 완료되었습니다.</p>
        <p>담당자가 확인할 수 있도록 저장되었습니다.</p>
      </div>
    )
  } else if (session.sendSession.authenticationRequired) {
    const masked = session.sendSession.maskedPhone ?? '지정된 번호'
    body = (
      <div className="contract-public-link-page__stack">
        <div className="contract-public-sign-page__card">
          <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--text-main)' }}>
            {session.sendSession.customerDisplayName}님, 계약서 확인을 위해 휴대폰 인증이 필요합니다.
          </p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--text-sub)' }}>
            인증번호는 계약서 발송 시 지정된 번호로만 발송됩니다.
          </p>
          <p
            className="mt-3 text-base font-semibold tracking-wide"
            style={{ color: 'var(--text-main)' }}
          >
            {masked}
          </p>
        </div>

        {otpError ? <StatusMessage tone="error" message={otpError} /> : null}

        <div className="contract-public-link-page__actions-col">
          <FormButton
            htmlType="button"
            variant="primary"
            fullWidth
            disabled={otpSending || cooldownSec > 0}
            loading={otpSending}
            onClick={() => void handleSendOtp()}
          >
            {cooldownSec > 0 ? `인증번호 받기 (${cooldownSec}초 후)` : '인증번호 받기'}
          </FormButton>
        </div>

        <div className="contract-public-link-page__otp-field">
          <label className="contract-public-link-page__otp-label" htmlFor="contract-otp-code">
            인증번호
          </label>
          <FormInput
            id="contract-otp-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={otpCode}
            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="6자리"
            maxLength={6}
            className="text-center text-lg tracking-widest"
          />
          <FormButton
            htmlType="button"
            variant={otpCodeValid ? 'primary' : 'secondary'}
            fullWidth
            disabled={otpVerifying || !otpCodeValid}
            loading={otpVerifying}
            onClick={() => void handleVerify()}
          >
            인증 확인
          </FormButton>
        </div>

        <p className="contract-public-link-page__hint">
          문자를 받지 못했거나 번호가 맞지 않으면 담당자에게 문의해 주세요.
        </p>
      </div>
    )
  } else {
    const docList = documents ?? session.documents
    body = (
      <div className="contract-public-link-page__stack">
        <div className="contract-public-sign-page__card">
          <p className="contract-public-sign-page__card-title">서명할 문서</p>
          <p className="contract-public-sign-page__notice mt-2">
            필수 문서를 모두 완료해야 전체 제출이 가능합니다. (서명 저장은 다음 단계에서 연결됩니다.)
          </p>
        </div>
        <ul className="contract-public-link-page__doc-list">
          {docList.map((d) => (
            <li key={d.id}>
              <Link
                className="contract-public-link-page__doc-link"
                to={`/contracts/sign/${encodeURIComponent(linkCode)}/documents/${encodeURIComponent(d.id)}`}
              >
                <span className="contract-public-link-page__doc-title">
                  {d.required ? (
                    <span className="contract-public-link-page__badge contract-public-link-page__badge--req">
                      필수
                    </span>
                  ) : (
                    <span className="contract-public-link-page__badge contract-public-link-page__badge--opt">
                      선택
                    </span>
                  )}
                  {d.title || '문서'}
                </span>
                <span className="contract-public-link-page__doc-status">{labelForDocStatus(d.status)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  return (
    <div className="contract-public-link-page">
      <div className="contract-public-link-page__inner">
        <h1 className="contract-public-link-page__title">계약서</h1>
        {body}
      </div>
    </div>
  )
}
