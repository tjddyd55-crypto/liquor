import { FormButton } from '../../../components/form'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { fetchTeamPosts, type TeamPostAttachment, type TeamPostRow } from '../api/teamApi'
import { TeamPostComments } from '../../../components/team/TeamPostComments'
import { TeamPostFormModal, type TeamPostModalInitialData } from '../components/TeamPostFormModal'

function snippet(text: string, max = 120): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) {
    return t
  }
  return `${t.slice(0, max)}…`
}

function formatPostDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('ko-KR')
}

function teamPostAuthorLabel(post: TeamPostRow): string {
  const display = post.authorDisplayName?.trim()
  if (display) {
    return display
  }
  const login = post.authorUsername?.trim()
  if (login) {
    return login
  }
  return '알 수 없음'
}

function isTeamPostElevatedRole(role: string | undefined): boolean {
  const r = String(role ?? '')
  return r === 'SUPER_ADMIN' || r === 'GA_ADMIN'
}

function canEditTeamPost(
  post: TeamPostRow,
  userId: string | undefined,
  ownerId: string | null,
  role: string | undefined,
): boolean {
  if (!userId) {
    return false
  }
  if (isTeamPostElevatedRole(role)) {
    return true
  }
  if (post.authorId === userId) {
    return true
  }
  if (ownerId && ownerId === userId) {
    return true
  }
  return false
}

function PostCard({
  post,
  showEdit,
  onEdit,
  expanded,
  onToggleExpand,
  token,
  currentUserId,
  commentCount,
  onCommentCountChange,
  highlighted,
  commentScrollNonce,
}: {
  post: TeamPostRow
  showEdit: boolean
  onEdit: (p: TeamPostRow) => void
  expanded: boolean
  onToggleExpand: () => void
  token: string
  currentUserId: string
  /** 한 번이라도 댓글 영역을 불러온 뒤에만 숫자로 표시 */
  commentCount?: number
  onCommentCountChange?: (postId: string, count: number) => void
  highlighted?: boolean
  commentScrollNonce?: number
}) {
  return (
    <div
      className={[
        'p-3 border-b border-[var(--border-default)] rounded-md transition-colors duration-300',
        highlighted ? 'bg-blue-900/20' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {post.isNotice ? (
        <div className="text-xs text-amber-400 mb-1">공지</div>
      ) : null}
      <div className="font-semibold text-[var(--text-primary)] flex flex-wrap items-baseline gap-2 min-w-0">
        <span className="min-w-0 [overflow-wrap:anywhere]">{post.title}</span>
        {typeof commentCount === 'number' ? (
          <span className="text-xs font-normal text-[var(--text-secondary)] opacity-90 shrink-0">댓글 {commentCount}개</span>
        ) : null}
      </div>
      <div className="text-xs text-[var(--text-secondary)] mt-1 opacity-85 min-w-0 break-words [overflow-wrap:anywhere]">
        <span className="align-middle">{teamPostAuthorLabel(post)}</span>
        <span className="mx-1 opacity-70">·</span>
        <time className="tabular-nums align-middle" dateTime={post.createdAt}>
          {formatPostDate(post.createdAt)}
        </time>
      </div>
      <div className="text-sm text-[var(--text-secondary)] mt-2">
        {expanded ? (
          <span className="whitespace-pre-wrap break-words">{post.content}</span>
        ) : (
          snippet(post.content)
        )}
      </div>
      {post.attachments.length > 0 ? (
        <div className="mt-2 flex flex-col gap-1">
          {post.attachments.map((file: TeamPostAttachment) => (
            <a
              key={file.id}
              href={file.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--text-primary)] underline"
            >
              {file.fileName}
            </a>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <FormButton htmlType="button" className="text-xs text-[var(--link)] underline" onClick={onToggleExpand}>
          {expanded ? '접기' : '펼치기 · 댓글'}
        </FormButton>
        {showEdit ? (
          <FormButton htmlType="button" className="text-xs text-[var(--link)] underline" onClick={() => onEdit(post)}>
            수정
          </FormButton>
        ) : null}
      </div>
      {expanded ? (
        <TeamPostComments
          postId={post.id}
          currentUserId={currentUserId}
          token={token}
          onCommentCountChange={onCommentCountChange}
          scrollSectionIntoViewNonce={commentScrollNonce}
        />
      ) : null}
    </div>
  )
}

export default function TeamPostsPage() {
  const { token, user } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [posts, setPosts] = useState<TeamPostRow[]>([])
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)

  const [postModalOpen, setPostModalOpen] = useState(false)
  const [postModalMode, setPostModalMode] = useState<'create' | 'edit'>('create')
  const [postModalInitial, setPostModalInitial] = useState<TeamPostModalInitialData | undefined>(undefined)
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null)
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [highlightPostId, setHighlightPostId] = useState<string | null>(null)
  const [commentScrollNonceByPost, setCommentScrollNonceByPost] = useState<Record<string, number>>({})
  const highlightClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCommentCountChange = useCallback((postId: string, count: number) => {
    setCommentCounts((prev) => ({ ...prev, [postId]: count }))
  }, [])

  const canSetNotice = Boolean(ownerId && user?.id && ownerId === user.id)

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setLoading(false)
      return
    }
    setLoadError('')
    try {
      const data = await fetchTeamPosts(token)
      setPosts(data.posts)
      setOwnerId(data.ownerId ?? null)
    } catch (e) {
      setPosts([])
      setOwnerId(null)
      setLoadError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (highlightClearTimerRef.current != null) {
        clearTimeout(highlightClearTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const st = location.state as {
      focusPostId?: string
      highlightFromNotification?: boolean
    } | null
    const id = st?.focusPostId?.trim()
    if (!id) {
      return
    }
    setExpandedPostId(id)
    if (st?.highlightFromNotification) {
      if (highlightClearTimerRef.current != null) {
        clearTimeout(highlightClearTimerRef.current)
      }
      setHighlightPostId(id)
      setCommentScrollNonceByPost((prev) => ({ ...prev, [id]: Date.now() }))
      highlightClearTimerRef.current = setTimeout(() => {
        setHighlightPostId(null)
        highlightClearTimerRef.current = null
      }, 2000)
    }
    navigate('.', { replace: true, state: null })
  }, [location.state, navigate])

  function openCreateModal() {
    setPostModalMode('create')
    setPostModalInitial(undefined)
    setPostModalOpen(true)
  }

  function openEditModal(post: TeamPostRow) {
    setPostModalMode('edit')
    setPostModalInitial({
      id: post.id,
      title: post.title,
      content: post.content,
      is_notice: post.isNotice,
    })
    setPostModalOpen(true)
  }

  function closePostModal() {
    setPostModalOpen(false)
  }

  return (
    <div className="content-wrapper page-shell">
      <h1 className="text-[var(--text-primary)]" style={{ marginTop: 12 }}>
        팀 게시판
      </h1>

      {loadError ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {loadError}
          {loadError.includes('소속') ? (
            <span className="block mt-2">
              <Link to="/profile" className="underline">
                프로필에서 팀에 참여
              </Link>
              해 주세요.
            </span>
          ) : null}
        </p>
      ) : null}

      {!loadError && !loading && token?.trim() ? (
        <div className="mt-4">
          <FormButton htmlType="button" className="cta-button" onClick={openCreateModal}>
            글 작성
          </FormButton>
        </div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-[var(--text-secondary)]">불러오는 중…</p>
      ) : !loadError ? (
        <div className="mt-6 border-t border-[var(--border-default)]">
          {posts.length === 0 ? (
            <p className="py-6 text-sm text-[var(--text-secondary)]">등록된 글이 없습니다.</p>
          ) : (
            posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                showEdit={canEditTeamPost(p, user?.id, ownerId, user?.role)}
                onEdit={openEditModal}
                expanded={expandedPostId === p.id}
                onToggleExpand={() => setExpandedPostId((cur) => (cur === p.id ? null : p.id))}
                token={token ?? ''}
                currentUserId={user?.id ?? ''}
                commentCount={commentCounts[p.id]}
                onCommentCountChange={handleCommentCountChange}
                highlighted={highlightPostId === p.id}
                commentScrollNonce={commentScrollNonceByPost[p.id]}
              />
            ))
          )}
        </div>
      ) : null}

      {token?.trim() ? (
        <TeamPostFormModal
          open={postModalOpen}
          onClose={closePostModal}
          mode={postModalMode}
          initialData={postModalInitial}
          token={token}
          canSetNotice={canSetNotice}
          onSuccess={() => void load()}
        />
      ) : null}
    </div>
  )
}
