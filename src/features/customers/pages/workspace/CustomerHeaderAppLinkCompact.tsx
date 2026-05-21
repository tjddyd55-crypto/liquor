import { useCallback, useEffect, useMemo, useState } from 'react'
import { FormButton } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import { copyTextToClipboard } from '../../../../lib/clipboard'
import {
  createCustomerAppLink,
  getCustomerAppLink,
  type CustomerAppLinkInfo,
} from '../../../claim-requests/api/claimRequestsApi'
import {
  CUSTOMER_APP_LINK_UPDATED_EVENT,
  notifyCustomerAppLinkUpdated,
  resolveCustomerAppConnectionState,
} from '../../../claim-requests/model/customerAppLinkConnection'

function resolveLinkUrl(info: CustomerAppLinkInfo | null): string {
  return String(info?.universalUrl ?? info?.connectUrl ?? '').trim()
}

function pillMeta(state: ReturnType<typeof resolveCustomerAppConnectionState>): {
  label: string
  className: string
} {
  switch (state) {
    case 'connected':
      return {
        label: '앱 연결',
        className: 'customer-workspace-app-link-bar__pill customer-workspace-app-link-bar__pill--ok',
      }
    case 'link_created':
      return {
        label: '앱 미연결',
        className: 'customer-workspace-app-link-bar__pill customer-workspace-app-link-bar__pill--pending',
      }
    case 'expired':
      return {
        label: '링크 만료',
        className: 'customer-workspace-app-link-bar__pill customer-workspace-app-link-bar__pill--expired',
      }
    default:
      return {
        label: '링크 미생성',
        className: 'customer-workspace-app-link-bar__pill',
      }
  }
}

type Props = {
  customerId: number
}

export default function CustomerHeaderAppLinkCompact({ customerId }: Props) {
  const { token } = useAuth()
  const [linkStatus, setLinkStatus] = useState<CustomerAppLinkInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [copyBusy, setCopyBusy] = useState(false)
  const [feedback, setFeedback] = useState('')

  const loadStatus = useCallback(async () => {
    if (!token?.trim() || !customerId) {
      setLinkStatus(null)
      return
    }
    setLoading(true)
    try {
      const status = await getCustomerAppLink(token, customerId)
      setLinkStatus(status)
    } catch {
      setLinkStatus(null)
    } finally {
      setLoading(false)
    }
  }, [token, customerId])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const onUpdated = () => {
      void loadStatus()
    }
    window.addEventListener(CUSTOMER_APP_LINK_UPDATED_EVENT, onUpdated)
    return () => window.removeEventListener(CUSTOMER_APP_LINK_UPDATED_EVENT, onUpdated)
  }, [loadStatus])

  useEffect(() => {
    const onFocus = () => {
      void loadStatus()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [loadStatus])

  useEffect(() => {
    if (!feedback) {
      return
    }
    const t = window.setTimeout(() => setFeedback(''), 2500)
    return () => window.clearTimeout(t)
  }, [feedback])

  const connectionState = useMemo(() => resolveCustomerAppConnectionState(linkStatus), [linkStatus])
  const pill = useMemo(() => pillMeta(connectionState), [connectionState])
  const linkUrl = useMemo(() => resolveLinkUrl(linkStatus), [linkStatus])

  const handleCopyLink = useCallback(async () => {
    if (!token?.trim()) {
      setFeedback('로그인이 필요합니다.')
      return
    }
    setCopyBusy(true)
    setFeedback('')
    try {
      let url = resolveLinkUrl(linkStatus)
      const needsCreate =
        !url || connectionState === 'not_created' || connectionState === 'expired'
      if (needsCreate) {
        const res = await createCustomerAppLink(token, customerId)
        url = String(res.universalUrl ?? res.connectUrl ?? '').trim()
        if (!url) {
          setFeedback('링크 응답 형식이 올바르지 않습니다.')
          return
        }
        setLinkStatus(res)
        notifyCustomerAppLinkUpdated()
        await loadStatus()
      }
      const copied = await copyTextToClipboard(url)
      if (!copied) {
        throw new Error('클립보드에 복사하지 못했습니다.')
      }
      setFeedback('연결 링크가 복사되었습니다.')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : '연결 링크 복사 실패')
    } finally {
      setCopyBusy(false)
    }
  }, [token, customerId, linkStatus, connectionState, loadStatus])

  return (
    <div
      className="customer-workspace-layout__claim-link-tools customer-header-app-link-compact"
      aria-label="고객앱 연결"
    >
      <span className={pill.className} title={loading ? '연결 상태 확인 중' : undefined}>
        {loading ? '확인 중…' : pill.label}
      </span>
      <FormButton
        htmlType="button"
        variant="secondary"
        size="sm"
        className="customer-header-app-link-compact__copy"
        loading={copyBusy}
        disabled={!token?.trim()}
        onClick={() => void handleCopyLink()}
        title="연결 URL을 클립보드에 복사합니다. 링크가 없으면 생성한 뒤 복사합니다."
      >
        연결 링크 복사
      </FormButton>
      {feedback ? <span className="customer-workspace-layout__claim-copy-result">{feedback}</span> : null}
    </div>
  )
}
