import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { FormButton } from '../../../components/form'
import { PublicPageBackButton } from '../../../components/PublicPageBackButton'
import { resolveApiUrl } from '../../../lib/apiClient'
import {
  createEmptyCustomerForm,
  CustomerFormFields,
  customerFormStateToSavePayload,
  getCustomerFormValidationError,
  type CustomerFormState,
} from '../../../components/customer/CustomerForm'
import { REGISTER_LINK_PAGE_DESC, REGISTER_LINK_PAGE_TITLE } from '../lib/customerInviteRegistrationMeta'
import { inviteCustomerApiRowToFormState } from '../utils/inviteCustomerApiRowToFormState'

const DEFAULT_APP_HTML_TITLE = '보험 신청·고객관리'
const DEFAULT_HTML_DESCRIPTION = '보험 신청·고객 관리 서비스.'

type InviteSessionResp =
  | { hasSubmission: false }
  | {
      hasSubmission: true
      locked: boolean
      editableUntil: string
      canEdit: boolean
      customer?: Record<string, unknown>
    }

function pickInviteEditableUntilIso(iso?: string | null): string {
  if (typeof iso === 'string' && iso.trim()) return iso.trim()
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
}

function tryWindowClose(onCannotClose?: () => void) {
  try {
    window.close()
  } catch {
    /* empty */
  }
  window.setTimeout(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
      onCannotClose?.()
    }
  }, 420)
}

type Props = {
  inviteRegistrationFlow?: boolean
}

export default function CustomerInputPage({ inviteRegistrationFlow = false }: Props) {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const refParam = useMemo(() => (searchParams.get('ref') ?? '').trim(), [searchParams])
  const inviteGaCode = useMemo(() => (searchParams.get('ga') ?? '').trim().toUpperCase(), [searchParams])
  const isRegisterPathOnly = location.pathname.includes('/customer/register')

  const [notice, setNotice] = useState('')
  const [customers, setCustomers] = useState<CustomerFormState[]>(() => [createEmptyCustomerForm()])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [inviteSessionBusy, setInviteSessionBusy] = useState(inviteRegistrationFlow)
  /** 초대 초대 플로우: 작성 vs 완료 */
  const [inviteUiPhase, setInviteUiPhase] = useState<'form' | 'complete'>('form')
  const [inviteSubmitKind, setInviteSubmitKind] = useState<'create' | 'update'>('create')

  const [editableUntilIso, setEditableUntilIso] = useState<string | null>(null)
  const [inviteLockedPermanent, setInviteLockedPermanent] = useState(false)
  const [inviteJustUpdated, setInviteJustUpdated] = useState(false)
  const [inviteCloseBanner, setInviteCloseBanner] = useState(false)

  /** 서버 시간 기준 — 클라 추정 금지, 응답의 editableUntil만 사용 */
  const resolveEditableUntilIso = (
    iso: string | null | undefined,
    fallbackDeadlineMs?: number | null,
  ): string => {
    if (typeof iso === 'string' && iso.trim()) return iso.trim()
    if (fallbackDeadlineMs != null && Number.isFinite(fallbackDeadlineMs)) {
      return new Date(fallbackDeadlineMs).toISOString()
    }
    /* 최후 폴백(이론상 응답 누락 방지용) — 실제 차단은 서버 */
    return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString()
  }

  const updateCustomerAt = useCallback((index: number, next: CustomerFormState) => {
    setCustomers((prev) => prev.map((row, i) => (i === index ? next : row)))
  }, [])

  const addCustomerRow = useCallback(() => {
    setCustomers((prev) => [...prev, createEmptyCustomerForm()])
    window.setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 100)
  }, [])

  const removeCustomerAt = useCallback((index: number) => {
    setCustomers((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }, [])

  /** 완료 화면 상태 공통 적용 — inviteRegistrationFlow 전용 */
  const applyInviteCompleteState = useCallback(
    ({
      editableIso,
      canEditNow,
      justUpdated,
    }: {
      editableIso?: string | null
      canEditNow: boolean
      justUpdated: boolean
    }) => {
      setEditableUntilIso(pickInviteEditableUntilIso(editableIso))
      setInviteLockedPermanent(!canEditNow)
      setInviteJustUpdated(justUpdated)
      setInviteUiPhase('complete')
      setNotice('')
      setInviteCloseBanner(false)
    },
    [],
  )

  /** GET 세션 초기 로드 */
  useEffect(() => {
    if (!(inviteRegistrationFlow && refParam && inviteGaCode)) {
      setInviteSessionBusy(false)
      return undefined
    }
    let canceled = false
    void (async () => {
      setInviteSessionBusy(true)
      try {
        const res = await fetch(resolveApiUrl('/api/customer/external-invite-session'), {
          method: 'GET',
          credentials: 'include',
        })
        const payload = (await res.json()) as InviteSessionResp
        if (canceled) return
        if (!payload?.hasSubmission) {
          setInviteUiPhase('form')
          setInviteSubmitKind('create')
          setInviteLockedPermanent(false)
          setEditableUntilIso(null)
          return
        }
        const p = payload as Extract<InviteSessionResp, { hasSubmission: true }>
        const deadlineMs = Date.parse(p.editableUntil)
        const canNow = Boolean(p.canEdit) && Number.isFinite(deadlineMs) && Date.now() < deadlineMs
        const locked = Boolean(p.locked) || !canNow

        setInviteSubmitKind('update')
        if (!locked && p.customer != null && typeof p.customer === 'object') {
          try {
            setCustomers([inviteCustomerApiRowToFormState(p.customer)])
          } catch {
            setCustomers([createEmptyCustomerForm()])
          }
        }

        applyInviteCompleteState({
          editableIso: p.editableUntil,
          canEditNow: canNow,
          justUpdated: false,
        })
      } catch {
        if (!canceled) setNotice('세션을 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요.')
      } finally {
        if (!canceled) setInviteSessionBusy(false)
      }
    })()
    return () => {
      canceled = true
    }
  }, [
    inviteGaCode,
    inviteRegistrationFlow,
    applyInviteCompleteState,
    refParam,
  ])

  useEffect(() => {
    if (!inviteRegistrationFlow) return undefined

    const prevTitle = document.title
    document.title = REGISTER_LINK_PAGE_TITLE

    let metaDesc = document.querySelector('meta[name="description"]')
    if (!metaDesc) {
      metaDesc = document.createElement('meta')
      metaDesc.setAttribute('name', 'description')
      document.head.appendChild(metaDesc)
    }
    const prevDesc = metaDesc.getAttribute('content') ?? ''
    metaDesc.setAttribute('content', REGISTER_LINK_PAGE_DESC)

    const created: HTMLElement[] = []
    const ensurePair = (selector: string, build: () => HTMLMetaElement, content?: string | null) => {
      let el = document.head.querySelector(selector) as HTMLMetaElement | null
      if (!el) {
        el = build()
        document.head.appendChild(el)
        created.push(el)
      }
      if (content != null) el.setAttribute('content', content)
    }

    ensurePair('meta[property="og:title"]', () => {
      const m = document.createElement('meta')
      m.setAttribute('property', 'og:title')
      return m
    }, REGISTER_LINK_PAGE_TITLE)

    ensurePair('meta[property="og:description"]', () => {
      const m = document.createElement('meta')
      m.setAttribute('property', 'og:description')
      return m
    }, REGISTER_LINK_PAGE_DESC)

    ensurePair('meta[name="twitter:card"]', () => {
      const m = document.createElement('meta')
      m.setAttribute('name', 'twitter:card')
      return m
    }, 'summary')

    ensurePair('meta[name="twitter:title"]', () => {
      const m = document.createElement('meta')
      m.setAttribute('name', 'twitter:title')
      return m
    }, REGISTER_LINK_PAGE_TITLE)

    ensurePair('meta[name="twitter:description"]', () => {
      const m = document.createElement('meta')
      m.setAttribute('name', 'twitter:description')
      return m
    }, REGISTER_LINK_PAGE_DESC)

    return () => {
      document.title = prevTitle || DEFAULT_APP_HTML_TITLE
      metaDesc?.setAttribute('content', prevDesc || DEFAULT_HTML_DESCRIPTION)
      created.forEach((node) => {
        node.parentNode?.removeChild(node)
      })
    }
  }, [inviteRegistrationFlow])

  useEffect(() => {
    if (!inviteRegistrationFlow) return undefined

    const url = `${window.location.pathname}${window.location.search}`
    const seal = () => {
      window.history.replaceState({ inviteRegSeal: true }, '', url)
    }
    seal()
    const onPop = () => {
      seal()
      window.history.pushState({ inviteRegSeal: true }, '', url)
    }
    window.addEventListener('popstate', onPop)
    window.history.pushState({ inviteRegSeal: true }, '', url)
    return () => {
      window.removeEventListener('popstate', onPop)
    }
  }, [inviteRegistrationFlow, location.pathname, location.search])

  async function handleSubmit() {
    if (!refParam) {
      setNotice('잘못된 접근입니다.')
      return
    }

    if (inviteRegistrationFlow && customers.length > 1) {
      setNotice('초대 링크에서는 한 명의 고객 정보만 등록할 수 있습니다.')
      return
    }

    for (let i = 0; i < customers.length; i += 1) {
      const msg = getCustomerFormValidationError(customers[i])
      if (msg) {
        setNotice(`${i + 1}번째 고객: ${msg}`)
        return
      }
    }

    setIsSubmitting(true)
    setNotice('전송 중…')

    try {
      if (inviteRegistrationFlow) {
        if (inviteSubmitKind === 'update') {
          const payload = customerFormStateToSavePayload(customers[0])
          const res = await fetch(resolveApiUrl('/api/customer/external-invite-registration'), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          })
          let errBody: Record<string, unknown> = {}
          if (!res.ok) {
            try {
              errBody = (await res.json()) as Record<string, unknown>
            } catch {
              errBody = {}
            }
            const msg =
              typeof errBody.message === 'string'
                ? errBody.message
                : `수정 저장에 실패했습니다 (${res.status})`
            const codeStr = typeof errBody.code === 'string' ? errBody.code : ''
            setNotice(msg)
            if (codeStr === 'EDIT_WINDOW_CLOSED') {
              setInviteLockedPermanent(true)
              applyInviteCompleteState({
                editableIso: editableUntilIso,
                canEditNow: false,
                justUpdated: false,
              })
            }
            return
          }

          const raw = (await res.json()) as Record<string, unknown>
          const inv = raw.inviteRegistration as { editableUntil?: string } | undefined
          const until =
            typeof inv?.editableUntil === 'string' ? inv.editableUntil : editableUntilIso ?? null
          const deadlineMs = until != null ? Date.parse(until) : NaN
          const canNow = Number.isFinite(deadlineMs) && Date.now() < deadlineMs
          applyInviteCompleteState({
            editableIso: until,
            canEditNow: canNow,
            justUpdated: true,
          })
          return
        }

        /* create */
        const payload = customerFormStateToSavePayload(customers[0])
        const body: Record<string, unknown> = {
          ...payload,
          inviteRegistration: true,
          refUsername: refParam,
          gaCode: inviteGaCode,
          ga: inviteGaCode,
        }
        const res = await fetch(resolveApiUrl('/api/customer/external-create'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(body),
        })

        if (res.status === 409) {
          let j: Record<string, unknown> = {}
          try {
            j = (await res.json()) as Record<string, unknown>
          } catch {
            j = {}
          }
          if (String(j.code ?? '') === 'ALREADY_SUBMITTED') {
            const untilIso = typeof j.editableUntil === 'string' ? j.editableUntil : null
            const canNow = j.canEdit === true
            setInviteSubmitKind('update')
            applyInviteCompleteState({
              editableIso: untilIso,
              canEditNow: canNow,
              justUpdated: false,
            })
            setNotice('')
            return
          }
          setNotice('이 요청으로는 등록을 완료할 수 없습니다.')
          return
        }

        if (!res.ok) {
          let errBody: Record<string, unknown> = {}
          try {
            errBody = (await res.json()) as Record<string, unknown>
          } catch {
            errBody = {}
          }
          const errMsgRaw = typeof errBody.message === 'string' ? errBody.message : undefined
          const errMsgFallback = typeof errBody.error === 'string' ? errBody.error : undefined
          const errMsg = errMsgRaw ?? errMsgFallback ?? '저장 실패'
          setNotice(errMsg)
          return
        }

        const raw = (await res.json()) as Record<string, unknown>
        const inv = raw.inviteRegistration as { editableUntil?: string } | undefined
        const untilIso = typeof inv?.editableUntil === 'string' ? inv.editableUntil : null
        const deadlineMs = untilIso != null ? Date.parse(untilIso) : NaN
        const canNow = Number.isFinite(deadlineMs) && Date.now() < deadlineMs

        setInviteSubmitKind('update')
        applyInviteCompleteState({
          editableIso: untilIso,
          canEditNow: canNow,
          justUpdated: false,
        })
        return
      }

      /* --- 기존 /customer/input 등 다건 전송 플로 (내부 CRM 영향 없음) --- */
      for (let i = 0; i < customers.length; i += 1) {
        const payload = customerFormStateToSavePayload(customers[i])
        const body: Record<string, unknown> = { ...payload }
        const isLegacyRegisterRoute = location.pathname.includes('/customer/register')

        if (isLegacyRegisterRoute) {
          body.refUsername = refParam
          body.gaCode = inviteGaCode
          body.ga = inviteGaCode
        } else if (
          /^\d+$/.test(refParam) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(refParam)
        ) {
          body.refUserId = refParam
          if (inviteGaCode) {
            body.gaCode = inviteGaCode
            body.ga = inviteGaCode
          }
        } else {
          body.refUsername = refParam
          if (inviteGaCode) {
            body.gaCode = inviteGaCode
            body.ga = inviteGaCode
          }
        }

        const res = await fetch(resolveApiUrl('/api/customer/external-create'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })

        if (!res.ok) {
          let errBody: Record<string, unknown> = {}
          try {
            errBody = (await res.json()) as Record<string, unknown>
          } catch {
            errBody = {}
          }
          const errMsgRaw = typeof errBody.message === 'string' ? errBody.message : undefined
          const errMsgFallback = typeof errBody.error === 'string' ? errBody.error : undefined
          const errMsg = errMsgRaw ?? errMsgFallback ?? '저장 실패'
          setNotice(`${i + 1}번째 고객: ${errMsg}`)
          setNotice(`전송 중 오류: ${i + 1}번째 고객에서 실패했습니다. (이전 고객은 이미 저장되었을 수 있습니다.)`)
          return
        }
      }

      setCustomers([createEmptyCustomerForm()])
      setNotice('정보가 전송되었습니다.')
    } catch (e) {
      setNotice(e instanceof Error ? e.message : '전송에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!refParam) {
    return (
      <main className={inviteRegistrationFlow ? 'page invite-registration-page' : 'page page--with-back'}>
        <header
          className={
            isRegisterPathOnly && !inviteRegistrationFlow ? 'page-header page-header--has-inline-back' : 'page-header'
          }
        >
          {isRegisterPathOnly && !inviteRegistrationFlow ? (
            <div className="page-header__title-row">
              <PublicPageBackButton className="customer-register-back-btn customer-register-back-btn--inline" />
              <h1>고객 정보 입력</h1>
            </div>
          ) : (
            <h1>고객 정보 입력</h1>
          )}
          <p>유효한 링크로 접속해 주세요.</p>
        </header>
      </main>
    )
  }

  if (isRegisterPathOnly && !inviteGaCode) {
    return (
      <main className={inviteRegistrationFlow ? 'page invite-registration-page' : 'page page--with-back'}>
        <header
          className={inviteRegistrationFlow ? 'page-header' : 'page-header page-header--has-inline-back'}
        >
          {!inviteRegistrationFlow ? (
            <div className="page-header__title-row">
              <PublicPageBackButton className="customer-register-back-btn customer-register-back-btn--inline" />
              <h1>고객 정보 입력</h1>
            </div>
          ) : (
            <h1>고객 정보 입력</h1>
          )}
          <p>링크에 GA 코드(ga)가 없습니다. 담당자에게 링크를 다시 요청해 주세요.</p>
        </header>
      </main>
    )
  }

  if (inviteRegistrationFlow && inviteSessionBusy && refParam && inviteGaCode) {
    return (
      <main className="page invite-registration-page">
        <header className="page-header">
          <h1>고객 정보 입력</h1>
          <p className="page-header-hint">불러오는 중입니다…</p>
        </header>
      </main>
    )
  }

  /** 초대 전용 완료 */
  if (inviteRegistrationFlow && inviteUiPhase === 'complete') {
    const deadlineMs = editableUntilIso != null ? Date.parse(editableUntilIso) : NaN
    const withinWindow =
      Number.isFinite(deadlineMs) && inviteLockedPermanent === false && Date.now() < deadlineMs

    return (
      <main className="page invite-registration-page">
        <header className="page-header">
          <h1>{inviteLockedPermanent ? '등록 정보' : '전송 완료'}</h1>
          {inviteJustUpdated ? (
            <>
              <p className="invite-registration-complete__lead">수정이 완료되었습니다.</p>
              <p className="page-header-hint">수정은 전송 후 3시간 이내에만 가능합니다.</p>
              <p className="page-header-hint">담당자가 확인 후 연락드리겠습니다.</p>
            </>
          ) : inviteLockedPermanent ? (
            <>
              <p className="invite-registration-complete__lead">이미 등록이 완료되었습니다.</p>
              <p className="page-header-hint">수정 가능 시간이 지났습니다.</p>
              <p className="page-header-hint">수정이 필요하면 담당자에게 연락해 주세요.</p>
            </>
          ) : (
            <>
              <p className="invite-registration-complete__lead">전송이 완료되었습니다.</p>
              <p className="page-header-hint">수정은 전송 후 3시간 이내에만 가능합니다.</p>
              <p className="page-header-hint">담당자가 확인 후 연락드리겠습니다.</p>
            </>
          )}
        </header>

        {inviteCloseBanner ? (
          <p className="invite-registration-complete__muted" role="status">
            창을 닫아 주세요.
          </p>
        ) : null}

        <div className="invite-registration-complete__actions">
          {withinWindow ? (
            <FormButton
              variant="secondary"
              htmlType="button"
              onClick={() => {
                setInviteUiPhase('form')
                setInviteSubmitKind('update')
                setInviteJustUpdated(false)
                setInviteCloseBanner(false)
                setNotice('')
              }}
            >
              수정하기
            </FormButton>
          ) : null}
          <FormButton
            variant="primary"
            htmlType="button"
            onClick={() => {
              setInviteCloseBanner(false)
              tryWindowClose(() => setInviteCloseBanner(true))
            }}
          >
            닫기
          </FormButton>
        </div>
      </main>
    )
  }

  return (
    <main
      className={
        inviteRegistrationFlow ? 'page invite-registration-page customers-page' : 'page customers-page page--with-back'
      }
    >
      <header className={isRegisterPathOnly && !inviteRegistrationFlow ? 'page-header page-header--has-inline-back' : 'page-header'}>
        {isRegisterPathOnly && !inviteRegistrationFlow ? (
          <div className="page-header__title-row">
            <PublicPageBackButton className="customer-register-back-btn customer-register-back-btn--inline" />
            <h1>고객 정보 입력</h1>
          </div>
        ) : (
          <h1>고객 정보 입력</h1>
        )}
        {!inviteRegistrationFlow && inviteGaCode ? (
          <p className="page-header-hint" style={{ marginTop: 6 }}>
            소속 GA 코드: <strong>{inviteGaCode}</strong>
          </p>
        ) : null}

        {!inviteRegistrationFlow ? (
          notice ? (
            <p>{notice}</p>
          ) : (
            <p className="page-header-hint">(필수: 이름)</p>
          )
        ) : notice.trim().length > 0 ? (
          <p className="page-header-notice" role="status">
            {notice}
          </p>
        ) : (
          <p className="page-header-hint">필수: 이름 외 선택 항목은 비워두셔도 됩니다.</p>
        )}
      </header>

      <div className="external-input-body">
        {customers.map((row, index) => (
          <div key={index} className="customer-card">
            <div className="customer-title">고객 {index + 1}</div>
            <CustomerFormFields
              form={row}
              onFormChange={(next) => updateCustomerAt(index, next)}
              radioSuffix={`external-${index}`}
              onStatusMessage={setNotice}
            />
            {!inviteRegistrationFlow && customers.length > 1 ? (
              <div style={{ marginTop: 12 }}>
                <FormButton
                  className="button button--secondary"
                  htmlType="button"
                  variant="secondary"
                  onClick={() => removeCustomerAt(index)}
                >
                  이 고객 칸 삭제
                </FormButton>
              </div>
            ) : null}
          </div>
        ))}

        {!inviteRegistrationFlow ? (
          <div className="add-btn-wrap">
            <FormButton className="button button--secondary" htmlType="button" variant="secondary" onClick={addCustomerRow}>
              + 고객 추가
            </FormButton>
          </div>
        ) : null}

        <FormButton
          className="button button--primary button--full"
          htmlType="button"
          variant="primary"
          disabled={isSubmitting}
          onClick={handleSubmit}
          style={{ marginTop: 8 }}
          loading={isSubmitting}
          loadingText={inviteSubmitKind === 'update' ? '수정 저장 중…' : '전송 중…'}
        >
          {inviteRegistrationFlow && inviteSubmitKind === 'update' ? '수정 전송' : '전송'}
        </FormButton>
      </div>
    </main>
  )
}
