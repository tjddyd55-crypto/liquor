import { ApiError, apiRequest } from '../../../lib/apiClient'

export type TeamMemberRow = {
  userId: string
  username: string
  displayName: string
  role: string
  teamId: string | null
}

export type TeamMembersResponse = {
  teamId: string | null
  teamName: string | null
  /** teams.owner_user_id — 팀장 사용자 id */
  ownerId: string | null
  /** teams.is_active — 해체 등으로 비활성이면 false */
  teamActive: boolean
  teamStorageUsedBytes?: number
  teamStorageLimitBytes?: number
  members: TeamMemberRow[]
}

export async function fetchTeamMembers(token: string): Promise<TeamMembersResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<TeamMembersResponse>('/api/teams/members', { token })
}

export async function createTeam(token: string, name?: string): Promise<{ teamId: string; name: string; gaId: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ teamId: string; name: string; gaId: number }>('/api/teams/create', {
    method: 'POST',
    token,
    body: JSON.stringify(name?.trim() ? { name: name.trim() } : {}),
  })
}

export async function joinTeam(token: string, teamId: string): Promise<{ ok: boolean; teamId: string; name: string; gaId: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(teamId ?? '').trim()
  if (!id) {
    throw new ApiError('팀 코드를 입력해 주세요.', 400)
  }
  return apiRequest<{ ok: boolean; teamId: string; name: string; gaId: number }>('/api/teams/join', {
    method: 'POST',
    token,
    body: JSON.stringify({ teamId: id }),
  })
}

export async function kickTeamMember(token: string, userId: string): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(userId ?? '').trim()
  if (!id) {
    throw new ApiError('대상을 지정해 주세요.', 400)
  }
  return apiRequest<{ ok: boolean }>('/api/teams/kick', {
    method: 'POST',
    token,
    body: JSON.stringify({ userId: id }),
  })
}

export async function leaveTeam(token: string): Promise<{ ok: boolean; disbanded?: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ ok: boolean; disbanded?: boolean }>('/api/teams/leave', {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
}

export async function transferTeamLeader(token: string, userId: string): Promise<{ ok: boolean; ownerId: string }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(userId ?? '').trim()
  if (!id) {
    throw new ApiError('새 팀장으로 지정할 사용자를 선택해 주세요.', 400)
  }
  return apiRequest<{ ok: boolean; ownerId: string }>('/api/teams/transfer-leader', {
    method: 'POST',
    token,
    body: JSON.stringify({ userId: id }),
  })
}

export async function disbandTeam(token: string): Promise<{ ok: boolean; disbanded: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ ok: boolean; disbanded: boolean }>('/api/teams/disband', {
    method: 'POST',
    token,
    body: JSON.stringify({}),
  })
}

export type TeamPostAttachment = {
  id: string
  fileUrl: string
  fileName: string
}

export type TeamPostRow = {
  id: string
  title: string
  content: string
  isNotice: boolean
  createdAt: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  attachments: TeamPostAttachment[]
}

export type TeamPostsListResponse = {
  teamId: string
  ownerId: string | null
  /** 페이지네이션 (기본 page=1, limit=20) */
  page?: number
  limit?: number
  hasNext?: boolean
  posts: TeamPostRow[]
}

export async function fetchTeamPosts(
  token: string,
  opts?: { page?: number; limit?: number },
): Promise<TeamPostsListResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const params = new URLSearchParams()
  if (opts?.page != null && opts.page >= 1) params.set('page', String(Math.floor(opts.page)))
  if (opts?.limit != null && opts.limit >= 1) params.set('limit', String(Math.floor(opts.limit)))
  const q = params.toString()
  return apiRequest<TeamPostsListResponse>(`/api/teams/posts${q ? `?${q}` : ''}`, { token })
}

export async function presignTeamPostAttachment(
  token: string,
  payload: { fileName: string; contentType: string; sizeBytes: number },
): Promise<{ uploadUrl: string; objectKey: string; putHeaders: Record<string, string> }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest('/api/teams/posts/attachments/presign', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function createTeamPost(
  token: string,
  body: {
    title: string
    content: string
    isNotice: boolean
    attachments: { objectKey: string; fileName: string; fileUrl: string }[]
  },
): Promise<{ postId: string; teamId: string }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest('/api/teams/posts', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export async function updateTeamPost(
  token: string,
  postId: string,
  body: { title: string; content: string; isNotice: boolean },
): Promise<void> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(postId ?? '').trim()
  if (!id) {
    throw new ApiError('게시글을 찾을 수 없습니다.', 400)
  }
  await apiRequest(`/api/teams/posts/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      title: body.title,
      content: body.content,
      isNotice: body.isNotice,
    }),
  })
}

export type TeamFileRow = {
  id: string
  fileUrl: string
  fileName: string
  postId: string
  postTitle: string
  postCreatedAt: string
}

export async function fetchTeamFiles(token: string): Promise<{ teamId: string; files: TeamFileRow[] }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ teamId: string; files: TeamFileRow[] }>('/api/teams/files', { token })
}

export type TeamPostCommentRow = {
  id: string
  postId: string
  content: string
  createdAt: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
}

export type TeamPostCommentsResponse = {
  comments: TeamPostCommentRow[]
}

export async function fetchTeamPostComments(token: string, postId: string): Promise<TeamPostCommentsResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(postId ?? '').trim()
  if (!id) {
    throw new ApiError('게시글을 찾을 수 없습니다.', 400)
  }
  return apiRequest<TeamPostCommentsResponse>(`/api/teams/posts/${encodeURIComponent(id)}/comments`, { token })
}

export async function createTeamPostComment(token: string, postId: string, content: string): Promise<void> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const id = String(postId ?? '').trim()
  if (!id) {
    throw new ApiError('게시글을 찾을 수 없습니다.', 400)
  }
  const body = String(content ?? '').trim()
  if (!body) {
    throw new ApiError('댓글 내용을 입력해 주세요.', 400)
  }
  await apiRequest(`/api/teams/posts/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    token,
    body: JSON.stringify({ content: body }),
  })
}

export async function deleteTeamPostComment(token: string, commentId: string): Promise<void> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const cid = String(commentId ?? '').trim()
  if (!cid) {
    throw new ApiError('댓글을 찾을 수 없습니다.', 400)
  }
  await apiRequest(`/api/teams/post-comments/${encodeURIComponent(cid)}`, {
    method: 'DELETE',
    token,
  })
}
