import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { FormButton, FormTextarea } from '../form'
import { useConfirmDialog } from '../dialog'
import { ApiError } from '../../lib/apiClient'
import {
  createTeamPostComment,
  deleteTeamPostComment,
  fetchTeamPostComments,
  type TeamPostCommentRow,
} from '../../features/team/api/teamApi'
import { dispatchNotificationRefresh } from '../../features/notification/notificationRefreshDispatch'

export type TeamPostCommentsProps = {
  postId: string
  currentUserId: string
  token: string
  /** 목록 카드에 댓글 수 표시용 (API 변경 없음) */
  onCommentCountChange?: (postId: string, count: number) => void
  /** 알림에서 진입 시 댓글 블록으로 스크롤(값이 바뀔 때마다 1회) */
  scrollSectionIntoViewNonce?: number
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function TeamPostComments({
  postId,
  currentUserId,
  token,
  onCommentCountChange,
  scrollSectionIntoViewNonce,
}: TeamPostCommentsProps) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [comments, setComments] = useState<TeamPostCommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listEndRef = useRef<HTMLDivElement>(null)
  const commentSectionRef = useRef<HTMLDivElement>(null)
  const lastScrollNonceRef = useRef<number | undefined>(undefined)

  const reportCount = useCallback(
    (n: number) => {
      onCommentCountChange?.(postId, n)
    },
    [postId, onCommentCountChange],
  )

  const loadComments = useCallback(async () => {
    if (!token?.trim() || !postId.trim()) {
      setComments([])
      reportCount(0)
      setLoading(false)
      return
    }
    setError('')
    setLoading(true)
    try {
      const { comments: rows } = await fetchTeamPostComments(token, postId)
      setComments(rows)
      reportCount(rows.length)
    } catch (e) {
      setComments([])
      reportCount(0)
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '댓글을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, postId, reportCount])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  useEffect(() => {
    if (scrollSectionIntoViewNonce == null) {
      return
    }
    if (lastScrollNonceRef.current === scrollSectionIntoViewNonce) {
      return
    }
    lastScrollNonceRef.current = scrollSectionIntoViewNonce
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        commentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  }, [scrollSectionIntoViewNonce])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = newComment.trim()
    if (!text || !token?.trim() || isSubmitting) {
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      await createTeamPostComment(token, postId, text)
      reportCount(comments.length + 1)
      dispatchNotificationRefresh()
      setNewComment('')
      await loadComments()
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          textareaRef.current?.focus()
        })
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '등록에 실패했습니다.')
      textareaRef.current?.focus()
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleDelete(commentId: string) {
    if (!token?.trim() || !commentId) {
      return
    }
    const confirmed = await confirm({
      title: '댓글 삭제',
      message: '이 댓글을 삭제할까요?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setDeletingId(commentId)
    setError('')
    try {
      await deleteTeamPostComment(token, commentId)
      reportCount(Math.max(0, comments.length - 1))
      await loadComments()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : '삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }

  const displayNameFor = (c: TeamPostCommentRow) =>
    c.authorDisplayName?.trim() || c.authorUsername?.trim() || '익명'

  const isValid = newComment.trim() !== ''

  return (
    <div
      ref={commentSectionRef}
      className="mt-5 pt-4 border-t border-[var(--border-default)] scroll-mt-[4.5rem]"
    >
      <div className="flex flex-wrap items-baseline gap-2 !mt-0 customer-section-title !mb-3">
        <span>댓글</span>
        {!loading ? (
          <span className="text-xs font-normal text-[var(--text-secondary)] opacity-90">({comments.length}개)</span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-[var(--danger)] mb-2" role="alert">
          {error}
        </p>
      ) : null}

      <div className="max-h-60 overflow-y-auto mb-3 pr-1 space-y-3">
        {loading ? (
          <p className="text-sm text-[var(--text-secondary)]">불러오는 중…</p>
        ) : comments.length === 0 ? (
          <div className="text-sm text-[var(--text-secondary)] py-3">아직 댓글이 없습니다</div>
        ) : (
          <>
            {comments.map((c) => {
              const isMine = currentUserId && c.authorId === currentUserId
              return (
                <div key={c.id} className="mb-3 pb-3 border-b border-[var(--border-default)] last:border-b-0 last:pb-0">
                  <div className="text-sm font-medium text-[var(--text-secondary)]">{displayNameFor(c)}</div>
                  <div className="text-sm text-[var(--text-primary)] mt-0.5 whitespace-pre-wrap break-words leading-relaxed">
                    {c.content}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <div className="text-xs text-[var(--text-secondary)] tabular-nums opacity-85">
                      {formatCommentDate(c.createdAt)}
                    </div>
                    {isMine ? (
                      <FormButton
                        htmlType="button"
                        variant="action"
                        className="text-xs text-red-400 hover:text-red-300 underline disabled:opacity-50"
                        disabled={deletingId === c.id}
                        onClick={() => void handleDelete(c.id)}
                      >
                        {deletingId === c.id ? '삭제 중…' : '삭제'}
                      </FormButton>
                    ) : null}
                  </div>
                </div>
              )
            })}
            <div ref={listEndRef} aria-hidden className="h-px w-full scroll-mt-2" />
          </>
        )}
      </div>

      <form onSubmit={(ev) => void handleSubmit(ev)} className="space-y-2">
        <FormTextarea
          ref={textareaRef}
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="댓글 입력 (Enter 줄바꿈)"
          rows={3}
          className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--bg-main)] text-[var(--text-primary)] px-3 py-2 text-sm box-border resize-y min-h-[4.5rem] placeholder:text-[var(--text-secondary)]"
          disabled={isSubmitting || !token?.trim()}
        />
        <FormButton
          htmlType="submit"
          variant="primary"
          className="button button--primary button--small"
          disabled={!isValid || isSubmitting || !token?.trim()}
        >
          {isSubmitting ? '등록중...' : '등록'}
        </FormButton>
      </form>
      {confirmDialog}
    </div>
  )
}
