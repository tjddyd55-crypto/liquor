import { useCallback, useEffect, useState } from 'react'
import { FormDialog, useConfirmDialog } from '../../../components/dialog'
import { EmptyState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormTextarea } from '../../../components/form'
import {
  deleteMyFeatureRequest,
  listMyFeatureRequestComments,
  listMyFeatureRequests,
  submitFeatureRequest,
  type FeatureRequestComment,
  type FeatureRequestStatus,
  type MyFeatureRequestRow,
} from '../../auth/authApi'
import { useAuth } from '../../auth/AuthProvider'
import { Button } from '../../../components/ui'

/*
 * 사용자 "문의 / 요청" 페이지.
 *
 * 역할:
 *   - 내가 보낸 요청 목록을 보여준다.
 *   - 각 요청의 상태(pending/reviewed/done) 와 **담당자 코멘트**를 확인할 수 있다.
 *   - 새 요청을 작성하거나, 내가 올린 요청을 삭제할 수 있다.
 *
 * 설계 포인트:
 *   - 코멘트는 별도 API(`/api/feature-requests/my/:id/comments`) 로 지연 로딩한다.
 *     목록 API 응답의 `comment_count` 로 "답변 N" 배지만 먼저 보여주고, 실제 본문은
 *     사용자가 펼칠 때만 가져와 네트워크 비용을 줄인다.
 *   - 확장 상태는 행별 id 로 관리하고, 한 번에 여러 행을 펼쳐볼 수 있게 둔다
 *     (요청 수가 200 이하로 상한이 걸려 있어 비용은 크지 않다).
 */

function formatDate(iso: string): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 10)
  }
  return d.toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short' })
}

function statusLabel(status: FeatureRequestStatus): string {
  if (status === 'done') {
    return '완료'
  }
  if (status === 'reviewed') {
    return '검토됨'
  }
  return '대기'
}

export default function FeatureRequestPage() {
  const { token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<MyFeatureRequestRow[]>([])
  const [listError, setListError] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [modalError, setModalError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set())
  const [commentsById, setCommentsById] = useState<Record<number, FeatureRequestComment[]>>({})
  const [commentsLoadingId, setCommentsLoadingId] = useState<number | null>(null)
  const [commentsErrorById, setCommentsErrorById] = useState<Record<number, string>>({})

  const loadRequests = useCallback(async () => {
    if (!token?.trim()) {
      return
    }
    setListError('')
    try {
      const list = await listMyFeatureRequests(token)
      setRows(list)
    } catch (e) {
      setListError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    }
  }, [token])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useEffect(() => {
    if (!open) {
      setTitle('')
      setContent('')
      setModalError('')
    }
  }, [open])

  const loadComments = useCallback(
    async (id: number) => {
      if (!token?.trim()) {
        return
      }
      setCommentsLoadingId(id)
      setCommentsErrorById((prev) => {
        if (!prev[id]) {
          return prev
        }
        const next = { ...prev }
        delete next[id]
        return next
      })
      try {
        const list = await listMyFeatureRequestComments(token, id)
        setCommentsById((prev) => ({ ...prev, [id]: list }))
      } catch (e) {
        setCommentsErrorById((prev) => ({
          ...prev,
          [id]: e instanceof Error ? e.message : '코멘트를 불러오지 못했습니다.',
        }))
      } finally {
        setCommentsLoadingId(null)
      }
    },
    [token],
  )

  const toggleExpand = async (id: number) => {
    const isOpen = expandedIds.has(id)
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (isOpen) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
    if (!isOpen && !commentsById[id]) {
      await loadComments(id)
    }
  }

  const handleDelete = async (id: number) => {
    const confirmed = await confirm({
      title: '요청 삭제',
      message: '삭제하시겠습니까?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    if (!token?.trim()) {
      return
    }
    setDeletingId(id)
    try {
      await deleteMyFeatureRequest(token, id)
      await loadRequests()
    } catch (e) {
      setListError(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const handleSubmit = async () => {
    const t = title.trim()
    const c = content.trim()
    if (!t || !c) {
      return
    }
    if (!token?.trim()) {
      setModalError('로그인이 필요합니다.')
      return
    }
    setModalError('')
    setIsSubmitting(true)
    try {
      await submitFeatureRequest(token, { title: t, content: c })
      setOpen(false)
      setTitle('')
      setContent('')
      await loadRequests()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '등록에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openModal = () => {
    setModalError('')
    setOpen(true)
  }

  const closeModal = () => {
    setOpen(false)
  }

  return (
    <main className="page--with-back content-wrapper">
      <div className="flex justify-between items-center mb-3">
        <h1 className="text-lg font-semibold">추가기능 요청하기</h1>
        <Button type="button" className="shrink-0 px-3 py-1.5 text-xs" onClick={openModal}>
          작성하기
        </Button>
      </div>

      <StatusMessage message={listError} tone="error" className="mb-2" />

      <div className="rounded-xl border border-[var(--border-default)] overflow-hidden bg-[var(--bg-elevated)]">
        {rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              message="등록된 요청이 없습니다."
              className="m-0 text-sm text-[var(--text-secondary)]"
            />
          </div>
        ) : (
          rows.map((item) => {
            const expanded = expandedIds.has(item.id)
            const comments = commentsById[item.id] ?? []
            const commentsError = commentsErrorById[item.id]
            const hasComments = item.comment_count > 0
            return (
              <div
                key={item.id}
                className="p-3 border-b border-[var(--border-default)] last:border-b-0"
              >
                <div className="flex gap-2 mb-1">
                  <span className="w-12 shrink-0 text-[var(--text-secondary)] text-sm">제목:</span>
                  <span className="text-[var(--text-primary)] text-sm break-words">
                    {item.title || '(제목 없음)'}
                  </span>
                </div>
                <div className="flex gap-2 mb-1">
                  <span className="w-12 shrink-0 text-[var(--text-secondary)] text-sm">내용:</span>
                  <span className="text-[var(--text-primary)] text-sm whitespace-pre-wrap break-words">
                    {item.content}
                  </span>
                </div>
                <div className="flex justify-between items-center text-xs mt-2 gap-2">
                  <div className="flex flex-wrap gap-3 text-[var(--text-secondary)] min-w-0">
                    <span>상태: {statusLabel(item.status)}</span>
                    <span className="tabular-nums">작성일: {formatDate(item.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      onClick={() => void toggleExpand(item.id)}
                      aria-expanded={expanded}
                      aria-controls={`my-req-comments-${item.id}`}
                    >
                      {expanded
                        ? '답변 접기'
                        : hasComments
                          ? `답변 보기 (${item.comment_count})`
                          : '답변 보기'}
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      className="text-[var(--danger)] disabled:opacity-50"
                      disabled={deletingId === item.id}
                      onClick={() => void handleDelete(item.id)}
                    >
                      {deletingId === item.id ? '삭제 중…' : '삭제'}
                    </FormButton>
                  </div>
                </div>

                {expanded ? (
                  <div
                    id={`my-req-comments-${item.id}`}
                    className="mt-3 rounded-lg border border-[var(--border-muted,#e5e7eb)] bg-[var(--bg-subtle,#f7f8fa)] p-3"
                  >
                    <div className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
                      담당자 답변
                    </div>
                    {commentsLoadingId === item.id && !commentsById[item.id] ? (
                      <div className="text-xs text-[var(--text-secondary)]">불러오는 중…</div>
                    ) : commentsError ? (
                      <div className="text-xs text-[var(--danger)]">
                        {commentsError}{' '}
                        <FormButton
                          htmlType="button"
                          variant="action"
                          className="underline text-xs !px-0 !py-0 align-baseline"
                          onClick={() => void loadComments(item.id)}
                        >
                          다시 시도
                        </FormButton>
                      </div>
                    ) : comments.length === 0 ? (
                      <div className="text-xs text-[var(--text-secondary)]">
                        아직 등록된 답변이 없습니다.
                      </div>
                    ) : (
                      <ul className="flex flex-col gap-2 m-0 p-0 list-none">
                        {comments.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-md border border-[var(--border-muted,#e5e7eb)] bg-[var(--bg-elevated,#fff)] p-2"
                          >
                            <div className="text-[11px] text-[var(--text-secondary)] mb-1">
                              {c.authorRole === 'admin' ? '담당자' : '요청자'} ·{' '}
                              {c.authorUsername || c.authorId} · {formatDate(c.createdAt)}
                            </div>
                            <div className="text-sm whitespace-pre-wrap break-words">
                              {c.content}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>

      <FormDialog
        open={open}
        onClose={closeModal}
        title="추가기능 요청 작성"
        panelClassName="max-w-xl"
        footer={
          <div className="flex gap-2 flex-wrap">
            <FormButton
              htmlType="button"
              variant="primary"
              loading={isSubmitting}
              loadingText="등록 중…"
              onClick={() => void handleSubmit()}
            >
              등록
            </FormButton>
            <FormButton
              htmlType="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={closeModal}
            >
              취소
            </FormButton>
          </div>
        }
      >
        <div className="space-y-3">
          <FieldWrapper label="제목">
            <FormInput
              className="w-full text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              autoComplete="off"
            />
          </FieldWrapper>
          <FieldWrapper label="내용">
            <FormTextarea
              className="w-full text-sm"
              rows={4}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={8000}
            />
          </FieldWrapper>
          <StatusMessage message={modalError} tone="error" />
        </div>
      </FormDialog>
      {confirmDialog}
    </main>
  )
}
