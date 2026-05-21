/**
 * FC/USER 전자문서 발송 내역 — 본인이 발송한 세션만 조회.
 */
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormButton, FormInput, FormSelect } from '../../../components/form'
import { useConfirmDialog } from '../../../components/dialog'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import '../../pdf-engine/pdf-engine.css'
import '../testConsole/contract-signature-console.css'
import '../userSend/contract-signature-send-mobile.css'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import type { SendSessionDetail } from '../testConsole/contractSignatureTestConsoleClient'
import {
  buildCustomerPublicSignUrl,
  cancelUserSendSession,
  getUserSendSessionDetail,
  listUserSendSessions,
  type SendSessionHistoryListItem,
} from './contractSignatureHistoryClient'
import { SendSessionDetailPanel } from './components/SendSessionDetailPanel'
import { SendSessionHistoryFilters, type HistoryFilter } from './components/SendSessionHistoryFilters'
import { SendSessionHistoryList } from './components/SendSessionHistoryList'

const PAGE_SIZE = 30

function formatCancelFailureMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const raw = e.message.trim()
    if (!raw || raw === 'DB_ERROR' || raw.toUpperCase() === 'DB_ERROR') {
      return '발송 취소 중 오류가 발생했습니다. 다시 시도해주세요.'
    }
    return raw
  }
  return '발송 취소 중 오류가 발생했습니다. 다시 시도해주세요.'
}

const HISTORY_MOBILE_MQ = '(max-width: 768px)'

export default function ContractSignatureHistoryPage() {
  const navigate = useNavigate()
  const { token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const t = token?.trim() ?? ''
  const historyMobile = useMediaQuery(HISTORY_MOBILE_MQ)

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [sort, setSort] = useState<'sent_desc' | 'completed_desc'>('sent_desc')
  const [rows, setRows] = useState<SendSessionHistoryListItem[]>([])
  const [total, setTotal] = useState(0)
  const [listBusy, setListBusy] = useState(false)
  const [moreBusy, setMoreBusy] = useState(false)
  const [listError, setListError] = useState<string | null>(null)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<SendSessionDetail | null>(null)
  const [detailRowHints, setDetailRowHints] = useState<{ hasSignedNotCompleted?: boolean } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [cancelBusy, setCancelBusy] = useState(false)
  /** 상세 패널이 열린 세션 ID — 취소 후 상세 갱신용 */
  const [panelSessionId, setPanelSessionId] = useState<string | null>(null)
  const [cancelFeedback, setCancelFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q.trim()), 320)
    return () => window.clearTimeout(id)
  }, [q])

  const reloadListFirstPage = useCallback(async () => {
    if (!t) {
      return
    }
    setListBusy(true)
    setListError(null)
    try {
      const res = await listUserSendSessions(t, {
        q: debouncedQ || undefined,
        filter,
        sort,
        limit: PAGE_SIZE,
        offset: 0,
      })
      setRows(res.sendSessions)
      setTotal(res.total)
    } catch (e) {
      setRows([])
      setTotal(0)
      setListError(e instanceof ApiError ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setListBusy(false)
    }
  }, [t, debouncedQ, filter, sort])

  useEffect(() => {
    void reloadListFirstPage()
  }, [reloadListFirstPage])

  const loadMore = async () => {
    if (!t || moreBusy || listBusy || rows.length >= total) {
      return
    }
    setMoreBusy(true)
    try {
      const res = await listUserSendSessions(t, {
        q: debouncedQ || undefined,
        filter,
        sort,
        limit: PAGE_SIZE,
        offset: rows.length,
      })
      setRows((prev) => [...prev, ...res.sendSessions])
    } catch {
      /* keep existing rows */
    } finally {
      setMoreBusy(false)
    }
  }

  const copyLink = async (linkCode: string) => {
    const url = buildCustomerPublicSignUrl(linkCode)
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('링크를 복사하세요', url)
    }
  }

  const openTab = (linkCode: string) => {
    window.open(buildCustomerPublicSignUrl(linkCode), '_blank', 'noopener,noreferrer')
  }

  const openDetail = async (row: SendSessionHistoryListItem) => {
    if (!t) {
      return
    }
    setDetailRowHints({ hasSignedNotCompleted: row.hasSignedNotCompleted })
    setPanelSessionId(row.id)
    setDetailOpen(true)
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    try {
      const d = await getUserSendSessionDetail(t, row.id)
      setDetail(d)
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : '상세를 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }

  const refreshDetail = async () => {
    if (!t || !detail?.id) {
      return
    }
    setDetailLoading(true)
    setDetailError(null)
    try {
      const d = await getUserSendSessionDetail(t, detail.id)
      setDetail(d)
    } catch (e) {
      setDetailError(e instanceof ApiError ? e.message : '상세를 불러오지 못했습니다.')
    } finally {
      setDetailLoading(false)
    }
  }

  const runCancel = async (sendSessionId: string) => {
    if (!t) {
      return
    }
    setCancelBusy(true)
    setCancelFeedback(null)
    try {
      const result = await cancelUserSendSession(t, sendSessionId)
      setCancelFeedback({ tone: 'success', text: result.message || '전자서명 발송이 취소되었습니다.' })
      await reloadListFirstPage()
      if (panelSessionId === sendSessionId) {
        setDetailLoading(true)
        setDetailError(null)
        try {
          const d = await getUserSendSessionDetail(t, sendSessionId)
          setDetail(d)
        } catch (e) {
          setDetailError(e instanceof ApiError ? e.message : '상세를 불러오지 못했습니다.')
        } finally {
          setDetailLoading(false)
        }
      }
    } catch (e) {
      setCancelFeedback({ tone: 'error', text: formatCancelFailureMessage(e) })
    } finally {
      setCancelBusy(false)
    }
  }

  const confirmCancelRow = async (row: SendSessionHistoryListItem) => {
    if (!row.canCancel) {
      return
    }
    const ok = await confirm({
      title: '전자서명 발송 취소',
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>이 전자서명 발송을 취소하시겠습니까?</p>
          <p style={{ margin: '0 0 8px' }}>취소하면 고객은 더 이상 링크에서 문서 작성·서명을 진행할 수 없습니다.</p>
          <p style={{ margin: 0 }}>발송 이력은 삭제되지 않습니다.</p>
        </>
      ),
      tone: 'danger',
      confirmLabel: '발송취소',
      cancelLabel: '취소하지 않기',
    })
    if (!ok) {
      return
    }
    void runCancel(row.id)
  }

  const confirmCancelDetail = async () => {
    if (!detail?.id) {
      return
    }
    const st = String(detail.status ?? '')
    if (st === 'completed' || st === 'cancelled' || st === 'expired') {
      return
    }
    if (detail.documents?.some((d) => d.status === 'completed')) {
      return
    }
    const ok = await confirm({
      title: '전자서명 발송 취소',
      message: (
        <>
          <p style={{ margin: '0 0 8px' }}>이 전자서명 발송을 취소하시겠습니까?</p>
          <p style={{ margin: '0 0 8px' }}>취소하면 고객은 더 이상 링크에서 문서 작성·서명을 진행할 수 없습니다.</p>
          <p style={{ margin: 0 }}>발송 이력은 삭제되지 않습니다.</p>
        </>
      ),
      tone: 'danger',
      confirmLabel: '발송취소',
      cancelLabel: '취소하지 않기',
    })
    if (!ok) {
      return
    }
    void runCancel(detail.id)
  }

  return (
    <main
      className={
        'insurance-dark-forms contract-signature-console contract-signature-history-page' +
        (historyMobile ? ' contract-signature-flow--mobile' : '')
      }
    >
      <div className="contract-signature-console__container">
        <h1 className="contract-signature-console__title">전자문서 발송 내역</h1>
        <p className="contract-signature-console__lead">
          내가 고객에게 발송한 전자서명 문서의 진행 상태와 완료 증빙을 확인합니다.
        </p>

        <p className="contract-signature-console__notice">
          전자서명 완료 문서는 증빙 보존을 위해 삭제할 수 없습니다. 진행 중인 건만 취소할 수 있습니다.
        </p>

        <section className="contract-signature-console__section">
          {historyMobile ? (
            <>
              <div className="contract-history-mobile-toolbar">
                <div className="contract-history-mobile-toolbar__search">
                  <FormInput
                    type="search"
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="고객명·고객번호·전화·템플릿명 검색"
                    disabled={!t}
                    className="contract-history-mobile-toolbar__search-input"
                  />
                </div>
                <div className="contract-history-mobile-toolbar__sort-row">
                  <label className="contract-history-mobile-toolbar__sort-label">
                    <span className="contract-history-mobile-toolbar__sort-text">정렬</span>
                    <FormSelect
                      className="form-select contract-history-mobile-toolbar__sort-select"
                      value={sort}
                      disabled={!t}
                      options={[
                        { value: 'sent_desc', label: '최신 발송순' },
                        { value: 'completed_desc', label: '완료일순' },
                      ]}
                      onChange={(e) =>
                        setSort(e.target.value === 'completed_desc' ? 'completed_desc' : 'sent_desc')
                      }
                    />
                  </label>
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    size="sm"
                    className="contract-history-mobile-toolbar__refresh"
                    disabled={!t || listBusy}
                    onClick={() => void reloadListFirstPage()}
                  >
                    새로고침
                  </FormButton>
                </div>
                <FormButton
                  htmlType="button"
                  variant="primary"
                  size="sm"
                  className="contract-history-mobile-toolbar__send-wide"
                  disabled={!t}
                  onClick={() => navigate('/contracts/signatures/send')}
                >
                  새 발송
                </FormButton>
              </div>
              <div className="contract-history-mobile-toolbar__status-filters">
                <SendSessionHistoryFilters value={filter} onChange={setFilter} />
              </div>
            </>
          ) : (
            <>
              <div className="contract-signature-console__filter-row" style={{ justifyContent: 'space-between' }}>
                <FormInput
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="고객명·고객번호·전화·템플릿명 검색"
                  disabled={!t}
                  style={{ maxWidth: 360, flex: '1 1 200px' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <label
                    className="contract-signature-console__hint"
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    정렬
                    <FormSelect
                      className="form-select"
                      value={sort}
                      disabled={!t}
                      options={[
                        { value: 'sent_desc', label: '최신 발송순' },
                        { value: 'completed_desc', label: '완료일순' },
                      ]}
                      onChange={(e) =>
                        setSort(e.target.value === 'completed_desc' ? 'completed_desc' : 'sent_desc')
                      }
                      style={{ minWidth: 140 }}
                    />
                  </label>
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    size="sm"
                    disabled={!t || listBusy}
                    onClick={() => void reloadListFirstPage()}
                  >
                    새로고침
                  </FormButton>
                  <FormButton
                    htmlType="button"
                    variant="primary"
                    size="sm"
                    disabled={!t}
                    onClick={() => navigate('/contracts/signatures/send')}
                  >
                    새 발송
                  </FormButton>
                </div>
              </div>
              <SendSessionHistoryFilters value={filter} onChange={setFilter} />
            </>
          )}

          {cancelFeedback ? (
            cancelFeedback.tone === 'success' ? (
              <div className="contract-signature-console__notice" role="status" style={{ marginBottom: 8 }}>
                {cancelFeedback.text}
              </div>
            ) : (
              <div className="contract-signature-console__alert--danger" role="alert" style={{ marginBottom: 8 }}>
                {cancelFeedback.text}
              </div>
            )
          ) : null}

          {listError ? (
            <div className="contract-signature-console__alert--danger" role="alert">
              {listError}
            </div>
          ) : null}

          {listBusy && rows.length === 0 ? <p className="contract-signature-console__hint">불러오는 중…</p> : null}

          {!listBusy && rows.length === 0 && !listError ? (
            <div>
              <p className="contract-signature-console__empty-state-text">아직 발송한 전자문서가 없습니다.</p>
              <Link className="contract-signature-console__hint" to="/contracts/signatures/send">
                전자서명 발송하기
              </Link>
            </div>
          ) : (
            <SendSessionHistoryList
              rows={rows}
              busy={listBusy || cancelBusy}
              listLayout={historyMobile ? 'cards' : 'table'}
              onDetail={(row) => void openDetail(row)}
              onCopyLink={(row) => void copyLink(row.linkCode)}
              onOpenLink={(row) => openTab(row.linkCode)}
              onCancel={confirmCancelRow}
            />
          )}

          {rows.length > 0 && rows.length < total ? (
            <div style={{ marginTop: 12 }}>
              <FormButton htmlType="button" variant="secondary" size="sm" disabled={moreBusy || !t} onClick={() => void loadMore()}>
                {moreBusy ? '불러오는 중…' : `더 보기 (${rows.length}/${total})`}
              </FormButton>
            </div>
          ) : null}
        </section>
      </div>

      <SendSessionDetailPanel
        open={detailOpen}
        detail={detail}
        loading={detailLoading}
        error={detailError}
        token={t}
        listHints={detailRowHints}
        layout={historyMobile ? 'mobile' : 'desktop'}
        onClose={() => {
          setDetailOpen(false)
          setDetail(null)
          setPanelSessionId(null)
        }}
        onRefresh={() => void refreshDetail()}
        onCancelSession={confirmCancelDetail}
        cancelBusy={cancelBusy}
        onCopyLink={(lc) => void copyLink(lc)}
        onOpenLink={(lc) => openTab(lc)}
      />
      {confirmDialog}
    </main>
  )
}
