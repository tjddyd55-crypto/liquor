import { FormButton, FormSelect, FormTextarea } from '../../../components/form'
import { Fragment, useCallback, useEffect, useState } from 'react'
import {
  createAdminFeatureRequestComment,
  listAdminFeatureRequestComments,
  listFeatureRequestsAdmin,
  updateFeatureRequestStatus,
  type FeatureRequestAdminRow,
  type FeatureRequestComment,
  type FeatureRequestStatus,
} from '../../auth/authApi'
import { useAuth } from '../../auth/AuthProvider'

/*
 * 기능 요청(문의/요청) 관리 — SUPER_ADMIN 전용.
 *
 * 구조 개요:
 *   - 테이블: 요청 1건이 1행. 상태 셀렉트로 변경.
 *   - 상세 패널(확장 행): "코멘트" 버튼 클릭 시 열리며, 기존 코멘트 목록 + 작성 폼.
 *
 * 설계 의도:
 *   1) 상태 변경은 **낙관적 업데이트 + 실패 시 롤백** 으로 피드백 지연 제거.
 *   2) 코멘트는 별도 API 를 지연 로딩(행을 펼친 경우에만 fetch)해 목록 뷰 비용 억제.
 *   3) 성공/실패 피드백은 행별 `rowNotice` / 전역 `error` 로 채널을 분리해
 *      서로가 서로를 덮는 회귀를 방지한다.
 */

const STATUS_OPTIONS: { value: FeatureRequestStatus; label: string }[] = [
  { value: 'pending', label: '대기 (pending)' },
  { value: 'reviewed', label: '검토됨 (reviewed)' },
  { value: 'done', label: '완료 (done)' },
]

function formatDate(iso: string): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

function formatDateTime(iso: string): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function statusToLabel(status: FeatureRequestStatus): string {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status
}

export default function FeatureRequestsAdminPage() {
  const { user, token } = useAuth()
  const [rows, setRows] = useState<FeatureRequestAdminRow[]>([])
  const [error, setError] = useState('')
  const [updatingId, setUpdatingId] = useState<number | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [commentsById, setCommentsById] = useState<Record<number, FeatureRequestComment[]>>({})
  const [commentsLoadingId, setCommentsLoadingId] = useState<number | null>(null)
  const [commentDraftById, setCommentDraftById] = useState<Record<number, string>>({})
  const [commentBusyId, setCommentBusyId] = useState<number | null>(null)
  const [rowNoticeById, setRowNoticeById] = useState<Record<number, string>>({})

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    setError('')
    try {
      const list = await listFeatureRequestsAdmin(token)
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * 행 알림(성공/실패) 자동 해제 — 4초 뒤 지움. 여러 행을 빠르게 저장해도 각 행의
   * 마지막 알림이 해당 타이머에 의해 개별적으로 사라지도록 로컬 clearTimeout 사용.
   */
  const flashRowNotice = useCallback((id: number, message: string) => {
    setRowNoticeById((prev) => ({ ...prev, [id]: message }))
    window.setTimeout(() => {
      setRowNoticeById((prev) => {
        if (prev[id] !== message) {
          return prev
        }
        const next = { ...prev }
        delete next[id]
        return next
      })
    }, 4000)
  }, [])

  const onStatusChange = async (id: number, nextStatus: FeatureRequestStatus) => {
    if (!token?.trim()) {
      return
    }
    const previous = rows.find((r) => r.id === id)?.status
    if (!previous || previous === nextStatus) {
      return
    }
    setUpdatingId(id)
    setError('')
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: nextStatus } : r)))
    try {
      await updateFeatureRequestStatus(token, id, nextStatus)
      flashRowNotice(id, `상태를 "${statusToLabel(nextStatus)}" 로 변경했습니다.`)
    } catch (e) {
      // 실패 시 이전 상태로 롤백 — 화면과 서버 상태의 괴리를 남기지 않는다.
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status: previous } : r)))
      console.error('[feature-request-admin] 상태 변경 실패', e)
      setError(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    } finally {
      setUpdatingId(null)
    }
  }

  const loadComments = useCallback(
    async (id: number) => {
      if (!token?.trim()) {
        return
      }
      setCommentsLoadingId(id)
      try {
        const list = await listAdminFeatureRequestComments(token, id)
        setCommentsById((prev) => ({ ...prev, [id]: list }))
      } catch (e) {
        console.error('[feature-request-admin] 코멘트 조회 실패', e)
        setError(e instanceof Error ? e.message : '코멘트를 불러오지 못했습니다.')
      } finally {
        setCommentsLoadingId(null)
      }
    },
    [token],
  )

  const toggleExpand = async (id: number) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    setExpandedId(id)
    if (!commentsById[id]) {
      await loadComments(id)
    }
  }

  const onSubmitComment = async (id: number) => {
    if (!token?.trim()) {
      return
    }
    const draft = (commentDraftById[id] ?? '').trim()
    if (!draft) {
      return
    }
    setCommentBusyId(id)
    try {
      const created = await createAdminFeatureRequestComment(token, id, draft)
      setCommentsById((prev) => ({
        ...prev,
        [id]: [...(prev[id] ?? []), created],
      }))
      setCommentDraftById((prev) => ({ ...prev, [id]: '' }))
      flashRowNotice(id, '코멘트를 등록했습니다.')
    } catch (e) {
      console.error('[feature-request-admin] 코멘트 작성 실패', e)
      setError(e instanceof Error ? e.message : '코멘트 등록에 실패했습니다.')
    } finally {
      setCommentBusyId(null)
    }
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>기능 요청 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>기능 요청 관리</h1>
        <p>{error || `총 ${rows.length}건 (최근 500건)`}</p>
      </header>

      <div
        className="card"
        style={{
          maxWidth: 'none',
          margin: 0,
          padding: 0,
          overflowX: 'auto',
        }}
      >
        <table
          style={{
            width: '100%',
            minWidth: 960,
            borderCollapse: 'collapse',
            fontSize: '14px',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>GA</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>아이디</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>제목</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>내용</th>
              <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600 }}>상태</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>생성일</th>
              <th style={{ textAlign: 'left', padding: '10px 12px', fontWeight: 600 }}>코멘트</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '20px 12px', color: 'var(--text-sub)' }}>
                  등록된 요청이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const isExpanded = expandedId === r.id
                const comments = commentsById[r.id] ?? []
                const draft = commentDraftById[r.id] ?? ''
                const rowNotice = rowNoticeById[r.id]
                return (
                  <Fragment key={r.id}>
                    <tr style={{ borderBottom: '1px solid var(--border)', verticalAlign: 'top' }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{r.ga_name}</td>
                      <td style={{ padding: '10px 8px', wordBreak: 'break-all' }}>{r.username}</td>
                      <td style={{ padding: '10px 8px', maxWidth: 160, wordBreak: 'break-word' }}>
                        {r.title || '—'}
                      </td>
                      <td style={{ padding: '10px 8px', maxWidth: 280, wordBreak: 'break-word' }}>
                        {r.content}
                      </td>
                      <td style={{ padding: '10px 8px' }}>
                        <FormSelect
                          value={r.status}
                          disabled={updatingId === r.id}
                          onChange={(e) => {
                            void onStatusChange(r.id, e.target.value as FeatureRequestStatus)
                          }}
                          aria-label={`${r.id} 상태`}
                          options={STATUS_OPTIONS}
                        />
                        {rowNotice ? (
                          <div
                            className="text-xs font-medium mt-1 text-[var(--brand-primary,#2563eb)]"
                            role="status"
                            aria-live="polite"
                          >
                            {rowNotice}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ padding: '10px 12px', fontVariantNumeric: 'tabular-nums' }}>
                        {formatDate(r.created_at)}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          onClick={() => void toggleExpand(r.id)}
                          aria-expanded={isExpanded}
                          aria-controls={`comments-${r.id}`}
                        >
                          {(() => {
                            if (isExpanded) {
                              return '접기'
                            }
                            /*
                             * 펼치기 전에는 코멘트 본문을 로드하지 않으므로 목록 응답의
                             * `comment_count` 를 그대로 사용. 펼친 후에는 낙관적으로 증가한
                             * `comments.length` 가 더 최신값이라 그 쪽을 우선한다.
                             */
                            const count = comments.length > 0 ? comments.length : r.comment_count
                            return count > 0 ? `코멘트 (${count})` : '코멘트'
                          })()}
                        </FormButton>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <td
                          id={`comments-${r.id}`}
                          colSpan={7}
                          style={{ padding: '12px 16px', background: 'var(--bg-subtle, #f7f8fa)' }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>코멘트</div>
                            {commentsLoadingId === r.id && !commentsById[r.id] ? (
                              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>불러오는 중…</div>
                            ) : comments.length === 0 ? (
                              <div style={{ fontSize: 12, color: 'var(--text-sub)' }}>
                                아직 작성된 코멘트가 없습니다.
                              </div>
                            ) : (
                              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {comments.map((c) => (
                                  <li
                                    key={c.id}
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: 8,
                                      background: c.authorRole === 'admin' ? 'var(--brand-primary-tint, #eaf1ff)' : 'var(--bg-elevated, #fff)',
                                      border: '1px solid var(--border-muted, #e5e7eb)',
                                    }}
                                  >
                                    <div style={{ fontSize: 11, color: 'var(--text-sub)', marginBottom: 4 }}>
                                      {c.authorRole === 'admin' ? '담당자' : '요청자'} ·{' '}
                                      {c.authorUsername || c.authorId} · {formatDateTime(c.createdAt)}
                                    </div>
                                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                      {c.content}
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            )}

                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <FormTextarea
                                className="w-full text-sm"
                                rows={2}
                                value={draft}
                                onChange={(e) =>
                                  setCommentDraftById((prev) => ({ ...prev, [r.id]: e.target.value }))
                                }
                                placeholder="요청자에게 전달할 답변을 입력하세요. (요청자 화면에 표시됩니다)"
                                maxLength={4000}
                              />
                              <div>
                                <FormButton
                                  htmlType="button"
                                  variant="primary"
                                  loading={commentBusyId === r.id}
                                  disabled={!draft.trim()}
                                  onClick={() => void onSubmitComment(r.id)}
                                >
                                  답변 등록
                                </FormButton>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  )
}
