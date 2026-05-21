import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StatusMessage } from '../../../components/feedback'
import { FormButton, FormSelect, FormTextarea } from '../../../components/form'
import useIsMobile from '../../../hooks/useIsMobile'
import { useAuth } from '../../auth/AuthProvider'
import {
  downloadClaimRequestFile,
  getClaimRequestDetail,
  listClaimRequests,
  openClaimRequestFile,
  type ClaimRequestDetail,
  type ClaimRequestFileItem,
  type ClaimRequestListItem,
  type ClaimRequestStatus,
  updateClaimRequestStatus,
} from '../api/claimRequestsApi'

const STATUS_OPTIONS: Array<{ value: ClaimRequestStatus | ''; label: string }> = [
  { value: '', label: '전체' },
  { value: 'requested', label: '요청됨' },
  { value: 'processing', label: '처리중' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
  { value: 'canceled', label: '취소' },
]

const DETAIL_STATUS_OPTIONS: Array<{ value: ClaimRequestStatus; label: string }> = [
  { value: 'requested', label: '요청됨' },
  { value: 'processing', label: '처리중' },
  { value: 'done', label: '완료' },
  { value: 'rejected', label: '반려' },
  { value: 'canceled', label: '취소' },
]

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

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) {
    return '0 KB'
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.ceil(bytes / 1024)} KB`
}

function statusLabel(status: ClaimRequestStatus | string): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? String(status ?? '')
}

function statusClass(status: ClaimRequestStatus | string): string {
  switch (status) {
    case 'requested':
      return 'claim-inbox__status claim-inbox__status--requested'
    case 'processing':
      return 'claim-inbox__status claim-inbox__status--processing'
    case 'done':
      return 'claim-inbox__status claim-inbox__status--done'
    case 'rejected':
    case 'canceled':
      return 'claim-inbox__status claim-inbox__status--closed'
    default:
      return 'claim-inbox__status'
  }
}

function isImageFile(file: ClaimRequestFileItem): boolean {
  return String(file.contentType ?? '').startsWith('image/')
}

export default function ClaimInboxPage() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const [rows, setRows] = useState<ClaimRequestListItem[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<ClaimRequestStatus | ''>('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ClaimRequestDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [statusTarget, setStatusTarget] = useState<ClaimRequestStatus>('processing')
  const [statusMemo, setStatusMemo] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [statusNotice, setStatusNotice] = useState('')
  const [error, setError] = useState('')
  const mobileDetailOpenRef = useRef(false)
  const modalHistoryPushedRef = useRef(false)

  const selectedRow = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId])
  const requestedCount = useMemo(() => rows.filter((row) => row.status === 'requested').length, [rows])
  const processingCount = useMemo(() => rows.filter((row) => row.status === 'processing').length, [rows])

  const loadRows = useCallback(async () => {
    if (!token) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await listClaimRequests(token, {
        status,
        page: 1,
        pageSize: 100,
      })
      const nextRows = res.rows ?? []
      setRows(nextRows)
      setTotal(Number(res.total ?? nextRows.length))
      setSelectedId((prev) => {
        if (prev && nextRows.some((row) => row.id === prev)) {
          return prev
        }
        return nextRows[0]?.id ?? null
      })
      if (nextRows.length === 0) {
        setDetail(null)
        setMobileDetailOpen(false)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '청구 요청 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [status, token])

  const loadDetail = useCallback(async () => {
    if (!token || selectedId == null) {
      setDetail(null)
      return
    }
    setDetailLoading(true)
    try {
      const data = await getClaimRequestDetail(token, selectedId)
      setDetail(data)
      setStatusTarget(data.status)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '청구 상세를 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }, [selectedId, token])

  useEffect(() => {
    void loadRows()
  }, [loadRows])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  useEffect(() => {
    mobileDetailOpenRef.current = mobileDetailOpen
  }, [mobileDetailOpen])

  useEffect(() => {
    const handlePopState = () => {
      if (!mobileDetailOpenRef.current || !modalHistoryPushedRef.current) {
        return
      }
      modalHistoryPushedRef.current = false
      mobileDetailOpenRef.current = false
      setMobileDetailOpen(false)
      setStatusMemo('')
      setError('')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (!statusNotice) {
      return
    }
    const timer = window.setTimeout(() => setStatusNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [statusNotice])

  const openCustomerClaimPage = useCallback((item: ClaimRequestListItem | ClaimRequestDetail | null) => {
    if (!item?.customerId) {
      return
    }
    navigate(`/customers/${item.customerId}/claim-requests?claimId=${item.id}`)
  }, [navigate])

  const openDetailModal = useCallback((row: ClaimRequestListItem) => {
    if (selectedId !== row.id) {
      setDetail(null)
      setStatusMemo('')
    }
    setSelectedId(row.id)
    setMobileDetailOpen(true)
    mobileDetailOpenRef.current = true
    if (!modalHistoryPushedRef.current) {
      window.history.pushState({ claimInboxModal: true }, '', window.location.href)
      modalHistoryPushedRef.current = true
    }
  }, [selectedId])

  const closeDetailModal = useCallback(() => {
    if (modalHistoryPushedRef.current) {
      window.history.back()
      return
    }
    setMobileDetailOpen(false)
    mobileDetailOpenRef.current = false
    setStatusMemo('')
    setError('')
  }, [])

  const handleOpenFile = useCallback(async (file: ClaimRequestFileItem) => {
    if (!token) {
      return
    }
    try {
      await openClaimRequestFile(token, file)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '파일을 열지 못했습니다.')
    }
  }, [token])

  const handleDownloadFile = useCallback(async (file: ClaimRequestFileItem) => {
    if (!token) {
      return
    }
    try {
      await downloadClaimRequestFile(token, file)
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : '파일을 다운로드하지 못했습니다.')
    }
  }, [token])

  const handleUpdateStatus = useCallback(async () => {
    if (!token || selectedId == null || !detail) {
      return
    }
    const memoToSend = statusMemo.trim()
    if (statusTarget === detail.status && !memoToSend) {
      setError('현재 상태와 동일합니다. 상태를 바꾸거나 메모를 입력해 주세요.')
      return
    }
    setActionBusy(true)
    setError('')
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
      await loadRows()
      await loadDetail()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : '상태 변경에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }, [detail, loadDetail, loadRows, selectedId, statusMemo, statusTarget, token])

  const renderDetailBody = (showCustomerPageButton: boolean) => {
    if (detailLoading) {
      return <div className="claim-inbox__empty">상세를 불러오는 중…</div>
    }
    if (!detail) {
      return <div className="claim-inbox__empty">목록에서 요청을 선택해 주세요.</div>
    }

    return (
      <div className="claim-inbox__detail">
        <div className="claim-inbox__detail-head">
          <div>
            <div className="claim-inbox__detail-title">#{detail.id} {detail.requesterName || detail.customerName}</div>
            <div className="claim-inbox__detail-meta">접수 {formatDateTime(detail.submittedAt)}</div>
            <div className="claim-inbox__detail-meta">연결고객: {detail.customerName}</div>
          </div>
          <span className={statusClass(detail.status)}>{statusLabel(detail.status)}</span>
        </div>

        {detail.memo ? <div className="claim-inbox__detail-memo">{detail.memo}</div> : null}

        {showCustomerPageButton ? (
          <div className="claim-inbox__detail-actions">
            <FormButton htmlType="button" variant="primary" onClick={() => openCustomerClaimPage(detail)}>
              고객 청구페이지 열기
            </FormButton>
          </div>
        ) : null}

        <div className="claim-inbox__detail-section claim-inbox__status-editor">
          <h3>상태 변경</h3>
          <div className="claim-inbox__status-editor-row">
            <FormSelect
              value={statusTarget}
              onChange={(event) => setStatusTarget(event.target.value as ClaimRequestStatus)}
              options={DETAIL_STATUS_OPTIONS}
            />
            <FormButton htmlType="button" variant="primary" onClick={() => void handleUpdateStatus()} loading={actionBusy}>
              상태 저장
            </FormButton>
          </div>
          <FormTextarea
            value={statusMemo}
            onChange={(event) => setStatusMemo(event.target.value)}
            rows={3}
            placeholder="상태 변경 메모 — 담당자 내부 기록용(상태 이력에 남습니다)"
            className="claim-inbox__status-memo"
          />
        </div>

        <div className="claim-inbox__detail-section">
          <h3>첨부 파일</h3>
          {detail.files.length === 0 ? <div className="claim-inbox__empty claim-inbox__empty--small">첨부 파일이 없습니다.</div> : null}
          {detail.files.length > 0 ? (
            <div className="claim-inbox__file-list">
              {detail.files.map((file) => (
                <div key={file.id} className="claim-inbox__file-item">
                  {isImageFile(file) ? (
                    <img className="claim-inbox__file-thumb" src={file.url} alt="" loading="lazy" />
                  ) : (
                    <span className="claim-inbox__file-thumb claim-inbox__file-thumb--file">PDF</span>
                  )}
                  <div className="claim-inbox__file-main">
                    <div className="claim-inbox__file-name">{file.fileName}</div>
                    <div className="claim-inbox__file-meta">{formatFileSize(file.fileSize)}</div>
                  </div>
                  <div className="claim-inbox__file-actions">
                    <button type="button" onClick={() => void handleOpenFile(file)}>열기</button>
                    <button type="button" onClick={() => void handleDownloadFile(file)}>다운</button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="claim-inbox__detail-section">
          <h3>상태 이력</h3>
          {detail.statusLogs.length === 0 ? <div className="claim-inbox__empty claim-inbox__empty--small">상태 이력이 없습니다.</div> : null}
          {detail.statusLogs.length > 0 ? (
            <ul className="claim-inbox__history-list">
              {detail.statusLogs.map((log) => (
                <li key={log.id} className="claim-inbox__history-item">
                  <strong>{log.fromStatus ? `${statusLabel(log.fromStatus)} → ` : ''}{statusLabel(log.toStatus)}</strong>
                  <span>{formatDateTime(log.changedAt)}</span>
                  {log.memo ? <p>{log.memo}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    )
  }

  return (
    <main className="claim-inbox content-wrapper">
      <StatusMessage message={error} tone="error" />
      <StatusMessage message={statusNotice} tone="success" />

      <section className="claim-inbox__hero">
        <div>
          <h1 className="claim-inbox__title">청구 확인</h1>
          <p className="claim-inbox__subtitle">고객앱에서 접수된 청구 요청을 한 곳에서 확인합니다.</p>
        </div>
        <FormButton htmlType="button" variant="secondary" onClick={() => void loadRows()} loading={loading}>
          새로고침
        </FormButton>
      </section>

      <section className="claim-inbox__summary-grid" aria-label="청구 요청 요약">
        <div className="claim-inbox__summary-card">
          <span>전체</span>
          <strong>{total}</strong>
        </div>
        <div className="claim-inbox__summary-card claim-inbox__summary-card--requested">
          <span>신규 요청</span>
          <strong>{requestedCount}</strong>
        </div>
        <div className="claim-inbox__summary-card claim-inbox__summary-card--processing">
          <span>처리중</span>
          <strong>{processingCount}</strong>
        </div>
      </section>

      <section className="claim-inbox__toolbar">
        <label className="claim-inbox__filter-label">
          상태 필터
          <FormSelect
            value={status}
            onChange={(event) => setStatus(event.target.value as ClaimRequestStatus | '')}
            options={STATUS_OPTIONS.map((item) => ({ value: item.value, label: item.label }))}
          />
        </label>
      </section>

      <section className="claim-inbox__workspace">
        <aside className="claim-inbox__list-panel" aria-label="청구 요청 목록">
          <div className="claim-inbox__panel-header">
            <h2>요청 목록</h2>
            <span>{rows.length}건</span>
          </div>
          {isMobile ? <p className="claim-inbox__mobile-help">목록을 누르면 상세창이 열립니다. 닫으면 이 목록으로 돌아옵니다.</p> : null}
          {loading ? <div className="claim-inbox__empty">청구 요청을 불러오는 중…</div> : null}
          {!loading && rows.length === 0 ? <div className="claim-inbox__empty">접수된 청구 요청이 없습니다.</div> : null}
          {rows.length > 0 ? (
            <div className="claim-inbox__list">
              {rows.map((row) => {
                const requesterName = row.requesterName || row.customerName || '고객'
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={row.id === selectedId && !isMobile ? 'claim-inbox__list-item claim-inbox__list-item--active' : 'claim-inbox__list-item'}
                    onClick={() => {
                      if (isMobile) {
                        openDetailModal(row)
                        return
                      }
                      setSelectedId(row.id)
                    }}
                  >
                    <div className="claim-inbox__list-item-top">
                      <strong>#{row.id} {requesterName}</strong>
                      <span className={statusClass(row.status)}>{statusLabel(row.status)}</span>
                    </div>
                    <div className="claim-inbox__list-meta">
                      {row.customerName} · {formatDateTime(row.submittedAt)} · 파일 {row.fileCount}개
                    </div>
                    {row.memo ? <div className="claim-inbox__list-memo">{row.memo}</div> : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </aside>

        {!isMobile ? (
          <section className="claim-inbox__detail-panel" aria-label="청구 요청 상세 미리보기">
            <div className="claim-inbox__panel-header">
              <h2>상세 미리보기</h2>
              {selectedRow ? <span>#{selectedRow.id}</span> : null}
            </div>
            {renderDetailBody(true)}
          </section>
        ) : null}
      </section>

      {isMobile && mobileDetailOpen ? (
        <div className="claim-inbox__modal-backdrop" role="dialog" aria-modal="true" aria-label="청구 상세" onClick={closeDetailModal}>
          <section className="claim-inbox__modal-panel" onClick={(event) => event.stopPropagation()}>
            <header className="claim-inbox__modal-header">
              <button type="button" className="claim-inbox__modal-back" onClick={closeDetailModal}>목록</button>
              <strong>청구 상세</strong>
              <button type="button" className="claim-inbox__modal-close" onClick={closeDetailModal}>닫기</button>
            </header>
            <div className="claim-inbox__modal-body">
              {renderDetailBody(false)}
            </div>
          </section>
        </div>
      ) : null}
    </main>
  )
}
