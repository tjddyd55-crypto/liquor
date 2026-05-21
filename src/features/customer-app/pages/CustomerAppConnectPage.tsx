import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { FormButton, FormInput } from '../../../components/form'
import { ApiError } from '../../../lib/apiClient'
import {
  connectCustomerApp,
  CUSTOMER_APP_PROFILE_INCOMPLETE_CODE,
  getCustomerAppConnectPrefill,
  type CustomerAppConnectPrefill,
} from '../api/customerAppApi'
import {
  readCustomerAppSession,
  resolveCustomerDeviceId,
  writeCustomerAppProfile,
  writeCustomerAppSession,
} from '../session/customerAppSession'
import { useCustomerAppSession } from '../session/useCustomerAppSession'

function resolveDevicePlatform(): 'android' | 'ios' | 'web' {
  if (/android/i.test(navigator.userAgent)) {
    return 'android'
  }
  if (/iphone|ipad|ipod/i.test(navigator.userAgent)) {
    return 'ios'
  }
  return 'web'
}

function hasRequiredDesignatedProfile(prefill: CustomerAppConnectPrefill | null): boolean {
  return Boolean(
    String(prefill?.name ?? '').trim() &&
      String(prefill?.birthDate ?? '').trim() &&
      String(prefill?.phone ?? '').trim(),
  )
}

export default function CustomerAppConnectPage() {
  const { linkCode: linkCodeParam } = useParams<{ linkCode?: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const session = useCustomerAppSession()
  const [linkCode, setLinkCode] = useState(String(linkCodeParam ?? '').trim().toUpperCase())
  const [name, setName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [prefillLoading, setPrefillLoading] = useState(false)
  const [error, setError] = useState('')
  const [prefillError, setPrefillError] = useState('')
  const [prefill, setPrefill] = useState<CustomerAppConnectPrefill | null>(null)
  const [serverDesignatedProfileIncomplete, setServerDesignatedProfileIncomplete] = useState(false)
  const [homeScreenHintOpen, setHomeScreenHintOpen] = useState(false)

  /** `/customer-app` 단독 진입: 이미 이 브라우저에 세션이 있으면 홈으로 (링크의 code 경로는 제외) */
  useEffect(() => {
    if (linkCodeParam) {
      return
    }
    const existing = readCustomerAppSession()
    if (existing?.appToken) {
      navigate('/customer-app/home', { replace: true })
    }
  }, [linkCodeParam, navigate])

  useEffect(() => {
    const qp = String(searchParams.get('code') ?? searchParams.get('token') ?? '').trim()
    if (linkCodeParam || !qp) {
      return
    }
    const qs = new URLSearchParams(window.location.search)
    qs.delete('code')
    qs.delete('token')
    const tail = qs.toString() ? `?${qs.toString()}` : ''
    navigate(`/customer-app/connect/${encodeURIComponent(qp)}${tail}`, { replace: true })
  }, [linkCodeParam, navigate, searchParams])

  useEffect(() => {
    setServerDesignatedProfileIncomplete(false)
  }, [linkCodeParam])

  /** 이미 이 링크로 연결된 세션이 있으면 연결 화면을 건너뛴다 */
  useEffect(() => {
    if (!linkCodeParam || prefillLoading) {
      return
    }
    const code = String(linkCodeParam).trim().toUpperCase()
    const existing = readCustomerAppSession()
    if (existing?.appToken && String(existing.linkCode ?? '').trim().toUpperCase() === code) {
      navigate('/customer-app/home', { replace: true })
    }
  }, [linkCodeParam, prefillLoading, navigate])

  useEffect(() => {
    const code = String(linkCodeParam ?? '').trim().toUpperCase()
    setLinkCode(code)
    setPrefill(null)
    setPrefillError('')
    setServerDesignatedProfileIncomplete(false)
    if (!code) {
      return
    }
    let cancelled = false
    setPrefillLoading(true)
    void getCustomerAppConnectPrefill(code)
      .then((nextPrefill) => {
        if (cancelled || !nextPrefill) {
          return
        }
        setPrefill(nextPrefill)
        setName(nextPrefill.name || '')
        setBirthDate(nextPrefill.birthDate || '')
        setPhone(nextPrefill.phone || '')
        setPrefillError('')
      })
      .catch((prefillLoadError) => {
        if (cancelled) {
          return
        }
        setPrefill(null)
        setPrefillError(prefillLoadError instanceof Error ? prefillLoadError.message : '연결 링크를 확인할 수 없습니다.')
      })
      .finally(() => {
        if (!cancelled) {
          setPrefillLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [linkCodeParam])

  const platform = useMemo(() => {
    const ua = navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(ua)
    const isSafari = /safari/.test(ua) && !/crios|fxios|edgios|chrome|android/.test(ua)
    if (isIos && isSafari) {
      return 'ios-safari'
    }
    if (/android/.test(ua) && /chrome|chromium|crios/.test(ua)) {
      return 'android-chrome'
    }
    return 'other'
  }, [])

  const isDesignatedLink = Boolean(linkCodeParam) && prefill?.mode === 'designated'
  const designatedPrefillProfileIncomplete = isDesignatedLink && Boolean(prefill?.isActive) && !hasRequiredDesignatedProfile(prefill)
  const designatedConnectBlocked =
    isDesignatedLink && Boolean(prefill?.isActive) && (designatedPrefillProfileIncomplete || serverDesignatedProfileIncomplete)

  const showPrefillFailure =
    Boolean(linkCodeParam) && !prefillLoading && prefill == null && Boolean(prefillError.trim())

  const persistAfterConnect = useCallback(
    (connected: Awaited<ReturnType<typeof connectCustomerApp>>, code: string, deviceId: string) => {
      const prof = connected.profile
      const requesterName = prof?.name ?? connected.customerName
      const requesterBirthDate = prof?.birthDate ?? ''
      const requesterPhone = prof?.phone ?? ''
      writeCustomerAppSession({
        appToken: connected.appToken,
        agentId: connected.agentId,
        customerId: connected.customerId,
        deviceId,
        agentName: connected.agentName,
        customerName: connected.customerName,
        linkCode: code,
        requesterName,
        requesterBirthDate,
        requesterPhone,
      })
      writeCustomerAppProfile({
        name: requesterName,
        birthDate: requesterBirthDate,
        phone: requesterPhone,
      })
    },
    [],
  )

  const runConnect = async (opts: {
    code: string
    useServerCustomerProfile: boolean
    requester?: { name: string; birthDate: string; phone: string }
    navigateToHome: boolean
  }) => {
    const code = opts.code.trim().toUpperCase()
    if (!code) {
      setError('링크 코드를 입력해 주세요.')
      return
    }
    if (!opts.useServerCustomerProfile) {
      const r = opts.requester
      if (!r?.name?.trim() || !r?.birthDate?.trim() || !r?.phone?.trim()) {
        setError('이름, 생년월일, 연락처를 모두 입력해 주세요.')
        return
      }
    }
    setLoading(true)
    setError('')
    try {
      const deviceId = resolveCustomerDeviceId()
      const connected = await connectCustomerApp({
        linkCode: code,
        deviceId,
        devicePlatform: resolveDevicePlatform(),
        appVersion: 'web-1.0.0',
        ...(opts.useServerCustomerProfile ? {} : { requester: opts.requester! }),
      })
      persistAfterConnect(connected, code, deviceId)
      setServerDesignatedProfileIncomplete(false)
      if (opts.navigateToHome) {
        navigate('/customer-app/home', { replace: true })
      }
    } catch (connectError) {
      if (
        isDesignatedLink &&
        opts.useServerCustomerProfile &&
        connectError instanceof ApiError &&
        connectError.status === 422 &&
        connectError.code === CUSTOMER_APP_PROFILE_INCOMPLETE_CODE
      ) {
        setServerDesignatedProfileIncomplete(true)
        setError('')
      } else {
        setError(connectError instanceof Error ? connectError.message : '연결에 실패했습니다.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleConnectWithRequester = async (payload: {
    code: string
    requesterName: string
    requesterBirthDate: string
    requesterPhone: string
  }) => {
    await runConnect({
      code: payload.code,
      useServerCustomerProfile: false,
      requester: {
        name: payload.requesterName.trim(),
        birthDate: payload.requesterBirthDate.trim(),
        phone: payload.requesterPhone.trim(),
      },
      navigateToHome: true,
    })
  }

  const handleConnectViaServerProfile = async (code: string, navigateToHome: boolean) => {
    await runConnect({
      code,
      useServerCustomerProfile: true,
      navigateToHome,
    })
  }

  const handleConnect = async () => {
    await handleConnectWithRequester({
      code: linkCode.trim().toUpperCase(),
      requesterName: name.trim(),
      requesterBirthDate: birthDate.trim(),
      requesterPhone: phone.trim(),
    })
  }

  /** 지정 고객 링크: 최초 1회만 고객이 눌러 연결 (자동 연결 없음) */
  const handleDesignatedConnect = async () => {
    if (designatedConnectBlocked) {
      return
    }
    if (!prefill?.isActive) {
      setError('연결 링크가 만료되었거나 올바르지 않습니다. 담당자에게 새 링크를 요청해 주세요.')
      return
    }
    await handleConnectViaServerProfile(linkCode.trim().toUpperCase(), true)
  }

  if (linkCodeParam && prefillLoading) {
    return (
      <main className="content-wrapper py-6 max-w-xl">
        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4">
          <StatusMessage message="연결 링크를 확인하고 있습니다." />
        </section>
      </main>
    )
  }

  if (showPrefillFailure) {
    return (
      <main className="content-wrapper py-6 max-w-xl">
        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 space-y-3">
          <h1 className="text-lg font-semibold">연결할 수 없습니다</h1>
          <StatusMessage
            message={
              prefillError.trim() ||
              '연결 링크가 만료되었거나 올바르지 않습니다. 담당자에게 새 링크를 요청해 주세요.'
            }
            tone="error"
          />
          <FormButton htmlType="button" variant="secondary" onClick={() => navigate('/customer-app', { replace: true })}>
            처음으로
          </FormButton>
        </section>
      </main>
    )
  }

  if (isDesignatedLink) {
    const displayName = String(prefill?.customerName ?? '').trim() || '고객'
    const agentLine = String(prefill?.agentName ?? '').trim()
    const gaLine = String(prefill?.gaCompanyName ?? '').trim()
    return (
      <main className="content-wrapper py-6 max-w-xl">
        <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-elevated)] px-5 py-6 space-y-4 text-center">
          <div className="text-3xl" aria-hidden="true">
            🛡️
          </div>
          <h1 className="text-xl font-semibold">{displayName} 고객님 맞으신가요?</h1>
          <p className="text-sm leading-6 text-[var(--text-secondary)]">
            연결하면 이 브라우저에서 청구·문의·소식지·내 정보를 이용할 수 있습니다.
          </p>
          {(agentLine || gaLine) && (
            <ul className="text-xs text-[var(--text-secondary)] text-left list-none p-0 m-0 space-y-1">
              {agentLine ? (
                <li>
                  <span className="text-[var(--text-primary)] font-semibold">담당</span> {agentLine}
                </li>
              ) : null}
              {gaLine ? (
                <li>
                  <span className="text-[var(--text-primary)] font-semibold">소속</span> {gaLine}
                </li>
              ) : null}
            </ul>
          )}

          {prefill?.isActive ? (
            <div className="space-y-2">
              <FormButton
                htmlType="button"
                variant="primary"
                className="w-full min-h-[44px]"
                onClick={() => void handleDesignatedConnect()}
                loading={loading}
                disabled={designatedConnectBlocked}
              >
                연결하기
              </FormButton>
              <button
                type="button"
                className="w-full text-sm text-[var(--text-secondary)] underline underline-offset-2 bg-transparent border-0 p-2 cursor-pointer"
                onClick={() => setHomeScreenHintOpen((v) => !v)}
              >
                자주 쓰시나요? 홈 화면에 추가하는 방법
              </button>
            </div>
          ) : (
            <StatusMessage message="연결 링크가 만료되었거나 올바르지 않습니다. 담당자에게 새 링크를 요청해 주세요." tone="error" />
          )}

          {designatedConnectBlocked ? (
            <div className="status status--error text-sm text-left space-y-1.5" role="alert">
              <p className="m-0 leading-6">고객앱 연결에 필요한 정보가 부족합니다.</p>
              <p className="m-0 leading-6">담당 설계사에게 이름, 생년월일, 연락처 등록을 요청해 주세요.</p>
            </div>
          ) : null}

          <StatusMessage message={prefillError} />
          <StatusMessage message={designatedConnectBlocked ? '' : error} tone="error" />
        </section>

        {homeScreenHintOpen ? (
          <section className="mt-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-4 space-y-2">
            <h2 className="text-sm font-semibold">
              {platform === 'ios-safari' ? 'iPhone · 홈 화면에 추가' : 'Android · 홈 화면에 추가'}
            </h2>
            {platform === 'ios-safari' ? (
              <ol className="text-xs leading-6 text-[var(--text-secondary)] list-decimal pl-4">
                <li>Safari 하단 또는 상단의 공유 버튼을 누릅니다.</li>
                <li>홈 화면에 추가를 선택합니다.</li>
                <li>오른쪽 위 추가를 누릅니다.</li>
              </ol>
            ) : platform === 'android-chrome' ? (
              <ol className="text-xs leading-6 text-[var(--text-secondary)] list-decimal pl-4">
                <li>Chrome 오른쪽 상단 메뉴(⋮)를 누릅니다.</li>
                <li>홈 화면에 추가를 선택합니다.</li>
                <li>안내에 따라 추가를 완료합니다.</li>
              </ol>
            ) : (
              <p className="text-xs leading-6 text-[var(--text-secondary)] m-0">
                브라우저 메뉴에서 이 사이트를 홈 화면에 추가·바로가기로 저장하는 기능을 찾아 주세요.
              </p>
            )}
            <FormButton htmlType="button" variant="secondary" className="w-full min-h-[44px]" onClick={() => setHomeScreenHintOpen(false)}>
              닫기
            </FormButton>
          </section>
        ) : null}
      </main>
    )
  }

  return (
    <main className="content-wrapper py-6 max-w-xl">
      <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 space-y-3">
        <h1 className="text-lg font-semibold">고객 앱 연결</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          설계사가 보낸 연결 링크를 눌러 주세요. 링크에 코드가 없으면 아래에 코드를 입력한 뒤 연결하기를 누릅니다. 회원가입이나 비밀번호는 필요하지
          않습니다.
        </p>
        <FormInput
          className="w-full"
          value={linkCode}
          onChange={(event) => setLinkCode(event.target.value.toUpperCase())}
          placeholder="예: ABC123XYZ"
          autoComplete="off"
        />
        <FormInput
          className="w-full"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="이름"
          autoComplete="name"
        />
        <FormInput
          className="w-full"
          value={birthDate}
          onChange={(event) => setBirthDate(event.target.value)}
          placeholder="생년월일 (예: 900101)"
          autoComplete="bday"
        />
        <FormInput
          className="w-full"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="연락처 (예: 010-1234-5678)"
          autoComplete="tel"
        />
        <FormButton htmlType="button" variant="primary" onClick={() => void handleConnect()} loading={loading}>
          연결하기
        </FormButton>
        <StatusMessage message={prefillLoading ? '고객 정보를 확인하고 있습니다.' : ''} />
        <StatusMessage message={prefillError} />
        <StatusMessage message={error} tone="error" />
        {session ? (
          <FormButton
            htmlType="button"
            variant="secondary"
            className="text-xs !p-0 !h-auto text-blue-600"
            onClick={() => navigate('/customer-app/home', { replace: true })}
          >
            기존 연결({session.customerName})로 홈 이동
          </FormButton>
        ) : null}
      </section>
    </main>
  )
}
