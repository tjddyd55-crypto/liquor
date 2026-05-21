import { ApiError, apiRequest } from '../../../lib/apiClient'

export type NotificationRow = {
  id: string
  userId: string
  gaId: number
  teamId: string | null
  type: string
  referenceId: string | null
  message: string
  isRead: boolean
  createdAt: string
}

export async function fetchNotifications(
  token: string,
  limit = 20,
): Promise<{ notifications: NotificationRow[] }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const lim = Math.min(50, Math.max(1, Math.floor(limit)))
  return apiRequest<{ notifications: NotificationRow[] }>(
    `/api/notifications?limit=${encodeURIComponent(String(lim))}`,
    { token },
  )
}

export async function fetchUnreadCount(token: string): Promise<{ count: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ count: number }>('/api/notifications/unread-count', { token })
}

export async function markNotificationRead(token: string, id: string): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const nid = String(id ?? '').trim()
  if (!nid) {
    throw new ApiError('알림을 찾을 수 없습니다.', 400)
  }
  return apiRequest<{ ok: boolean }>(`/api/notifications/${encodeURIComponent(nid)}/read`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({}),
  })
}
