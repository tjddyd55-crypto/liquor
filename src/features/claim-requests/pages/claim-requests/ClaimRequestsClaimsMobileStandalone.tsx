import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router-dom'
import { StatusMessage } from '../../../../components/feedback'
import { useAuth } from '../../../auth/AuthProvider'
import {
  createCustomerAppLink,
  downloadClaimRequestFile,
  getClaimRequestDetail,
  getCustomerAppLink,
  listClaimRequests,
  openClaimRequestFile,
  type ClaimRequestDetail,
  type ClaimRequestListItem,
  type ClaimRequestStatus,
  type CustomerAppLinkInfo,
  updateClaimRequestStatus,
} from '../../api/claimRequestsApi'
import ClaimRequestsClaimsMobileView from './ClaimRequestsClaimsMobileView'

const STATUS_OPTIONS: Array<{ value: ClaimRequestStatus; label: string }> = [
  { value: 'requested', label: '요청됨' },
  { value: 'processing', label: '처리중' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
  { value: 'canceled', label: '취소' },
]

type CustomerAppConnectionState = 'not_created' | 'link_created' | 'connected' | 'expired'

function parsePositiveInt(raw: string | null): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function statusLabel(status: ClaimRequestStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status
}

function statusBadgeClass(status: ClaimRequestStatus): string {
  switch (status) {
    case 'done':
      return 'claim-requests-page__badge claim-requests-page__badge--done'
    case 'processing':
      return 'claim-requests-page__badge claim-requests-page__badge--processing'
    case 'requested':
      return 'claim-requests-page__badge claim-requests-page__badge--requested'
    case 'rejected':
    case 'canceled':
      return 'claim-requests-page__badge claim-requests-page__badge--rejected'
    default:
      return 'claim-requests-page__badge'
  }
}

function resolveConnectionState(linkStatus: CustomerAppLinkInfo | null): CustomerAppConnectionState {
  const state = linkStatus?.connectionState
  if (state === 'not_created' || state === 'link_created' || state === 'connected' || state === 'expired') {
    return state
  }
  if (!linkStatus || !linkStatus.linkCode) {
    return 'not_created'
  }
  const status = String(linkStatus.status ?? '').toLowerCase()
  const expiresAtMs = linkStatus.expiresAt ? new Date(linkStatus.expiresAt).getTime() : null
  const expiredByTime = expiresAtMs != null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()
  if (expiredByTime || status === 'expired' || status === 'revoked' || status === 'disabled') {
    return 'expired'
  }
  if (Boolean(linkStatus.lastConnectedAt) || Number(linkStatus.deviceCount ?? 0) > 0) {
    return 'connected'
  }
  return 'link_created'
}

const EMBED_IN_CUSTOMER_WORKSPACE_PATH = /^\/customers\/\d+(\/|$)/

export default function ClaimRequestsClaimsMobileStandalone() {
  const { token } = useAuth()
  const location = useLocation()
  const embedInCustomerWorkspace = EMBED_IN_CUSTOMER_WORKSPACE_PATH.test(location.pathname)
  const { customerId: customerIdParam } = useParams<{ customerId?: string }>()
  const [searchParams] = useSearchParams()
  const activeCustomerId = useMemo(() => {
    const fromQuery = parsePositiveInt(searchParams.get('customerId'))
    if (fromQuery != null) {
      return fromQuery
    }
    return parsePositiveInt(customerIdParam ?? null)
  }, [customerIdParam, searchParams])
  const targetClaimId = useMemo(() => parsePositiveInt(searchParams.get('claimId')), [searchParams])

  const [rows, setRows] = useState<ClaimRequestListItem[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ClaimRequestDetail | null>(null)
  const [linkStatus, setLinkStatus] = useState<CustomerAppLinkInfo | null>(null)
  const [linkStatusLoading, setLinkStatusLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [createdLink, setCreatedLink] = useState('')
  const [createdCode, setCreatedCode] = useState('')
  const [copyResult, setCopyResult] = useState('')
  const [error, setError] = useState('')
  const [statusNotice, setStatusNotice] = useState('')
  const [statusMemo, setStatusMemo] = useState('')
  const [statusTarget, setStatusTarget] = useState<ClaimRequestStatus>('processing')
  const [actionBusy, setActionBusy] = useState(false)

  const displayedCode = createdCode || linkStatus?.agentCode || linkStatus?.linkCode || ''
  const displayedLink = createdLink || linkStatus?.universalUrl || ''
  const selectedRow = useMemo(() => rows.find((item) => item.id === selectedId) ?? null, [rows, selectedId])
  const latestDeviceLabel = useMemo(() => {
    if (detail?.deviceId?.trim()) {
      return detail.deviceId.trim()
    }
    if (selectedRow?.deviceId?.trim()) {
      return selectedRow.deviceId.trim()
    }
    return '미확인'
  }, [detail?.deviceId, selectedRow?.deviceId])
  const connectionState = useMemo(() => resolveConnectionState(linkStatus), [linkStatus])
  const connectionMeta = useMemo(() => {
    switch (connectionState) {
      case 'connected':
        return {
          title: '앱 연결됨',
          subtitle: linkStatus?.lastConnectedAt ? `최근 접속: ${formatDateTime(linkStatus.lastConnectedAt)}` : '최근 접속 정보 없음',
          className: 'claim-requests-page__status-value claim-requests-page__status-value--ok',
        }
      case 'link_created':
        return {
          title: '링크 생성됨',
          subtitle: '아직 접속 전',
          className: 'claim-requests-page__status-value claim-requests-page__status-value--pending',
        }
      case 'expired':
        return {
          title: '링크 만료',
          subtitle: '재생성 필요',
          className: 'claim-requests-page__status-value claim-requests-page__status-value--expired',
        }
      case 'not_created':
      default:
        return {
          title: '미연결',
          subtitle: '아직 링크 미생성',
          className: 'claim-requests-page__status-value',
        }
    }
  }, [connectionState, linkStatus?.lastConnectedAt])
  const linkActionLabel = useMemo(() => {
    switch (connectionState) {
      case 'link_created':
      case 'connected':
        return '링크 재전송'
      case 'expired':
        return '새 링크 생성'
      case 'not_created':
      default:
        return '링크 생성'
    }
  }, [connectionState])

  const loadList = useCallback(async () => {
    if (!token) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await listClaimRequests(token, {
        page: 1,
        pageSize: 50,
        customerId: activeCustomerId,
      })
      const nextRows = res.rows || []
      setRows(nextRows)
      if (nextRows.length > 0) {
        const targetExists = targetClaimId != null && nextRows.some((item) => item.id === targetClaimId)
        const nextSelectedId = targetExists ? targetClaimId : selectedId && nextRows.some((item) => item.id === selectedId) ? selectedId : nextRows[0].id
        setSelectedId(nextSelectedId)
        if (targetExists) {
          setMobileDetailOpen(true)
        }
      } else {
        setSelectedId(null)
        setDetail(null)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '요청 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [activeCustomerId, selectedId, targetClaimId, token])

  const loadDetail = useCallback(async () => {
    if (!token || selectedId == null) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const response = await getClaimRequestDetail(token, selectedId)
      setDetail(response)
      setStatusTarget(response.status)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '요청 상세를 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }, [selectedId, token])

  const loadLinkStatus = useCallback(async () => {
    if (!token?.trim() || !activeCustomerId) {
      setLinkStatus(null)
      return
    }
    setLinkStatusLoading(true)
    try {
      const current = await getCustomerAppLink(token, activeCustomerId)
      setLinkStatus(current)
    } catch {
      setLinkStatus(null)
    } finally {
      setLinkStatusLoading(false)
    }
  }, [activeCustomerId, token])

  useEffect(() => {
    void loadList()
  }, [loadList])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    if (embedInCustomerWorkspace) {
      return
    }
    void loadLinkStatus()
  }, [embedInCustomerWorkspace, loadLinkStatus])

  useEffect(() => {
    setCreatedLink('')
    setCreatedCode('')
    setCopyResult('')
  }, [activeCustomerId])

  useEffect(() => {
    if (!statusNotice) {
      return
    }
    const timer = window.setTimeout(() => setStatusNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [statusNotice])

  const handleCreateLink = async () => {
    if (!token) {
      return
    }
    if (!activeCustomerId) {
      setError('먼저 좌측 고객 리스트에서 고객을 선택해 주세요.')
      return
    }
    setActionBusy(true)
    setCreatedLink('')
    setCreatedCode('')
    try {
      const res = await createCustomerAppLink(token, activeCustomerId)
      const linkUrl = res.universalUrl || ''
      if (!linkUrl) {
        setError('링크 응답 형식이 올바르지 않습니다.')
        return
      }
      setCreatedLink(linkUrl)
      setCreatedCode(String(res.agentCode ?? res.linkCode ?? '').trim())
      setError('')
      await loadLinkStatus()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '링크 생성에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleCopyText = useCallback(async (value: string, label: string) => {
    if (!value.trim()) {
      return
    }
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('clipboard API unavailable')
      }
      await navigator.clipboard.writeText(value)
      setCopyResult(`${label} 복사 완료`)
    } catch {
      setCopyResult(`${label} 복사 실패`)
    }
  }, [])

  const handleOpenLinkPreview = useCallback(() => {
    if (!displayedLink.trim()) {
      return
    }
    window.open(displayedLink, '_blank', 'noopener,noreferrer')
  }, [displayedLink])

  const handleShareBySms = useCallback(async () => {
    if (!displayedLink.trim()) {
      setError('먼저 링크를 생성해 주세요.')
      return
    }
    await handleCopyText(displayedLink, 'URL')
    window.location.href = `sms:?body=${encodeURIComponent(displayedLink)}`
  }, [displayedLink, handleCopyText])

  const handleShareByKakao = useCallback(async () => {
    if (!displayedLink.trim()) {
      setError('먼저 링크를 생성해 주세요.')
      return
    }
    await handleCopyText(displayedLink, 'URL')
    setCopyResult('카카오톡으로 공유할 URL을 복사했습니다.')
  }, [displayedLink, handleCopyText])

  const handleSelectClaim = useCallback((id: number) => {
    setSelectedId(id)
    setMobileDetailOpen(true)
  }, [])

  const handleUpdateStatus = async () => {
    if (!token || selectedId == null || !detail) {
      return
    }
    const memoToSend = statusMemo.trim()
    if (statusTarget === detail.status && !memoToSend) {
      setStatusNotice('')
      setError('현재 상태와 동일합니다. 상태를 바꾸거나 메모를 입력해 주세요.')
      return
    }
    setError('')
    setActionBusy(true)
    try {
      const result = await updateClaimRequestStatus(token, selectedId, {
        status: statusTarget,
        memo: memoToSend,
      })
      setStatusMemo('')
      setStatusNotice(
        memoToSend
          ? `상태를 "${statusLabel(result.status)}" 로 변경하고 메모를 기록했습니다.`
          : `상태를 "${statusLabel(result.status)}" 로 변경했습니다.`,
      )
      await loadList()
      await loadDetail()
    } catch (actionError) {
      setStatusNotice('')
      setError(actionError instanceof Error ? actionError.message : '상태 변경에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleOpenClaimFile = useCallback(
    async (file: ClaimRequestDetail['files'][number]) => {
      if (!token?.trim()) {
        setError('로그인이 필요합니다.')
        return
      }
      try {
        await openClaimRequestFile(token, file)
      } catch (openError) {
        setError(openError instanceof Error ? openError.message : '파일 열기에 실패했습니다.')
      }
    },
    [token],
  )

  const handleDownloadClaimFile = useCallback(
    async (file: ClaimRequestDetail['files'][number]) => {
      if (!token?.trim()) {
        setError('로그인이 필요합니다.')
        return
      }
      try {
        await downloadClaimRequestFile(token, file)
      } catch (downloadError) {
        setError(downloadError instanceof Error ? downloadError.message : '파일 다운로드에 실패했습니다.')
      }
    },
    [token],
  )

  return (
    <ClaimRequestsClaimsMobileView
      feedbackSection={
        <>
          <StatusMessage message={error} tone="error" />
          <StatusMessage message={statusNotice} />
        </>
      }
      activeCustomerId={activeCustomerId}
      displayedCode={displayedCode}
      displayedLink={displayedLink}
      linkActionLabel={linkActionLabel}
      actionBusy={actionBusy}
      copyResult={copyResult}
      linkStatus={linkStatus}
      linkStatusLoading={linkStatusLoading}
      connectionMeta={connectionMeta}
      latestDeviceLabel={latestDeviceLabel}
      rows={rows}
      selectedId={selectedId}
      loading={loading}
      detail={detail}
      detailLoading={detailLoading}
      mobileDetailOpen={mobileDetailOpen}
      statusTarget={statusTarget}
      statusMemo={statusMemo}
      statusOptions={STATUS_OPTIONS}
      onCreateLink={() => void handleCreateLink()}
      onCopyCode={() => void handleCopyText(displayedCode, '코드')}
      onCopyLink={() => void handleCopyText(displayedLink, 'URL')}
      onShareBySms={() => void handleShareBySms()}
      onShareByKakao={() => void handleShareByKakao()}
      onOpenLinkPreview={handleOpenLinkPreview}
      onSelectClaim={handleSelectClaim}
      onCloseMobileDetail={() => setMobileDetailOpen(false)}
      onStatusTargetChange={setStatusTarget}
      onStatusMemoChange={setStatusMemo}
      onUpdateStatus={() => void handleUpdateStatus()}
      onOpenFile={(file) => void handleOpenClaimFile(file)}
      onDownloadFile={(file) => void handleDownloadClaimFile(file)}
      formatDateTime={formatDateTime}
      statusLabel={statusLabel}
      statusBadgeClass={statusBadgeClass}
      embedInCustomerWorkspace={embedInCustomerWorkspace}
    />
  )
}
