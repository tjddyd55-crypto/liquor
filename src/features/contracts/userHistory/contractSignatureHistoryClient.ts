import { ApiError, apiRequest } from '../../../lib/apiClient'
import { getPublicOrigin } from '../../../lib/publicOrigin'
import type { SendSessionDetail } from '../testConsole/contractSignatureTestConsoleClient'

export type SendSessionHistoryListItem = {
  id: string
  linkCode: string
  customerId: number
  customerName: string
  customerCode: string | null
  maskedPhone: string
  templateNames: string[]
  documentCount: number
  requiredDocumentCount: number
  completedDocumentCount: number
  status: string
  identityStatus: string | null
  createdAt: string
  sentAt: string | null
  openedAt: string | null
  identityVerifiedAt: string | null
  completedAt: string | null
  expiresAt: string | null
  evidenceHashPrefix: string | null
  hasSignedPdfFile: boolean
  hasSignedNotCompleted: boolean
  canCancel: boolean
  canDelete: boolean
  canCopyLink: boolean
  canOpenLink: boolean
  canResend: boolean
}

export type ListUserSendSessionsResult = {
  sendSessions: SendSessionHistoryListItem[]
  total: number
  limit: number
  offset: number
}

export async function listUserSendSessions(
  token: string,
  params: {
    q?: string
    filter?: 'all' | 'in_progress' | 'completed' | 'expired' | 'cancelled'
    sort?: 'sent_desc' | 'completed_desc'
    limit?: number
    offset?: number
  },
): Promise<ListUserSendSessionsResult> {
  const qs = new URLSearchParams()
  if (params.q?.trim()) {
    qs.set('q', params.q.trim())
  }
  if (params.filter && params.filter !== 'all') {
    qs.set('filter', params.filter)
  }
  if (params.sort) {
    qs.set('sort', params.sort)
  }
  if (params.limit != null) {
    qs.set('limit', String(params.limit))
  }
  if (params.offset != null) {
    qs.set('offset', String(params.offset))
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  const body = await apiRequest<{
    sendSessions?: SendSessionHistoryListItem[]
    total?: number
    limit?: number
    offset?: number
  }>(`/api/contracts/send-sessions${suffix}`, { method: 'GET', token })
  const raw = body as ListUserSendSessionsResult
  if (!raw?.sendSessions || !Array.isArray(raw.sendSessions)) {
    throw new ApiError('발송 내역 응답 형식이 올바르지 않습니다.', 500)
  }
  return {
    sendSessions: raw.sendSessions,
    total: Number(raw.total) || 0,
    limit: Number(raw.limit) || 30,
    offset: Number(raw.offset) || 0,
  }
}

export async function getUserSendSessionDetail(token: string, sendSessionId: string): Promise<SendSessionDetail> {
  const body = await apiRequest<{ sendSession?: SendSessionDetail }>(
    `/api/contracts/send-sessions/${encodeURIComponent(sendSessionId)}`,
    { method: 'GET', token },
  )
  const s = (body as { sendSession?: SendSessionDetail }).sendSession
  if (!s?.id || !s.linkCode) {
    throw new ApiError('발송 세션 상세 응답이 올바르지 않습니다.', 500)
  }
  return s
}

export type CancelUserSendSessionResult = {
  ok: true
  status: string
  message: string
}

export async function cancelUserSendSession(token: string, sendSessionId: string): Promise<CancelUserSendSessionResult> {
  const body = await apiRequest<CancelUserSendSessionResult>(`/api/contracts/send-sessions/${encodeURIComponent(sendSessionId)}/cancel`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({}),
  })
  const b = body as CancelUserSendSessionResult & { ok?: boolean }
  if (!b || b.ok !== true) {
    throw new ApiError('발송 취소 응답이 올바르지 않습니다.', 500)
  }
  return b
}

/**
 * 고객용 전자서명 공개 URL (복사·새 탭).
 * Electron `file://` 문서에서는 `window.location.origin`이 `file://` 계열이 될 수 있어
 * `getPublicOrigin()`(VITE_BASE_URL 등) 우선 — 없으면 상대 경로만 반환.
 */
export function buildCustomerPublicSignUrl(linkCode: string): string {
  const raw = String(linkCode ?? '').trim()
  const path = `/contracts/sign/${encodeURIComponent(raw)}`
  let base = getPublicOrigin().trim().replace(/\/$/, '')
  if (!base || base.startsWith('file:')) {
    return path
  }
  return `${base}${path}`
}
