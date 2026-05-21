import { apiRequest } from '../../../lib/apiClient'

export type GovernmentNoticeRow = {
  id: string
  tenantId: string | null
  scopeType: string
  title: string
  content: string
  category: string
  status: string
  isPinned: boolean
  createdByUserId: string | null
  createdByDisplayName: string
  publishedAt: string | null
  createdAt: string | null
  updatedAt: string | null
  tenantName: string
}

export type GovernmentResourceRow = {
  id: string
  tenantId: string | null
  scopeType: string
  title: string
  description: string
  category: string
  status: string
  fileName: string
  fileKey: string
  fileSize: number
  mimeType: string
  createdByDisplayName: string
  publishedAt: string | null
  createdAt: string | null
  tenantName: string
}

function unwrapList<T>(raw: unknown): T[] {
  if (!raw || typeof raw !== 'object') return []
  const o = raw as Record<string, unknown>
  if (Array.isArray(o.data)) return o.data as T[]
  return Array.isArray(raw) ? (raw as T[]) : []
}

function unwrapData<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.data && typeof o.data === 'object') return o.data as T
  return raw as T
}

export type OpsListQuery = {
  managerView?: boolean
  status?: string
  category?: string
  q?: string
  tenantId?: string
}

function buildQs(query?: OpsListQuery): string {
  const params = new URLSearchParams()
  if (query?.managerView) params.set('managerView', 'true')
  if (query?.status) params.set('status', query.status)
  if (query?.category) params.set('category', query.category)
  if (query?.q) params.set('q', query.q)
  if (query?.tenantId) params.set('tenantId', query.tenantId)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export async function fetchGovernmentNotices(
  token: string,
  query?: OpsListQuery,
): Promise<GovernmentNoticeRow[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/notices${buildQs(query)}`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovernmentNoticeRow>(raw)
}

export async function fetchGovernmentNotice(
  token: string,
  id: string,
  managerView = false,
): Promise<GovernmentNoticeRow> {
  const qs = managerView ? '?managerView=true' : ''
  const raw = await apiRequest<unknown>(`/api/government-support/notices/${encodeURIComponent(id)}${qs}`, {
    method: 'GET',
    token,
  })
  const row = unwrapData<GovernmentNoticeRow>(raw)
  if (!row) throw new Error('공지를 불러오지 못했습니다.')
  return row
}

export async function createGovernmentNotice(
  token: string,
  body: Record<string, unknown>,
): Promise<GovernmentNoticeRow> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/notices', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovernmentNoticeRow>(raw)
  if (!row) throw new Error('공지 저장에 실패했습니다.')
  return row
}

export async function updateGovernmentNotice(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<GovernmentNoticeRow> {
  const raw = await apiRequest<unknown>(`/api/government-support/admin/notices/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovernmentNoticeRow>(raw)
  if (!row) throw new Error('공지 저장에 실패했습니다.')
  return row
}

export async function archiveGovernmentNotice(token: string, id: string): Promise<void> {
  await apiRequest<unknown>(`/api/government-support/admin/notices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}

export async function fetchGovernmentResources(
  token: string,
  query?: OpsListQuery,
): Promise<GovernmentResourceRow[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/resources${buildQs(query)}`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovernmentResourceRow>(raw)
}

export async function presignGovernmentResource(
  token: string,
  body: Record<string, unknown>,
): Promise<{ uploadUrl: string; objectKey: string; putHeaders: Record<string, string>; resourceId: string }> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/resources/presign', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const data = unwrapData<{
    uploadUrl: string
    objectKey: string
    putHeaders: Record<string, string>
    resourceId: string
  }>(raw)
  if (!data?.uploadUrl) throw new Error('업로드 URL을 받지 못했습니다.')
  return data
}

export async function saveGovernmentResource(
  token: string,
  body: Record<string, unknown>,
): Promise<GovernmentResourceRow> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/resources', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovernmentResourceRow>(raw)
  if (!row) throw new Error('자료 저장에 실패했습니다.')
  return row
}

export async function updateGovernmentResource(
  token: string,
  id: string,
  body: Record<string, unknown>,
): Promise<GovernmentResourceRow> {
  const raw = await apiRequest<unknown>(`/api/government-support/admin/resources/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovernmentResourceRow>(raw)
  if (!row) throw new Error('자료 저장에 실패했습니다.')
  return row
}

export async function archiveGovernmentResource(token: string, id: string): Promise<void> {
  await apiRequest<unknown>(`/api/government-support/admin/resources/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}

export async function downloadGovernmentResource(token: string, id: string): Promise<void> {
  const base =
    (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ||
    (import.meta.env.VITE_API_BASE_PATH as string | undefined)?.replace(/\/$/, '') ||
    '/backend'
  const res = await fetch(`${base}/government-support/resources/${encodeURIComponent(id)}/download`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, application/octet-stream',
    },
  })
  if (!res.ok) {
    let message = '다운로드에 실패했습니다.'
    try {
      const err = (await res.json()) as { message?: string }
      if (err.message) message = err.message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    const json = (await res.json()) as { data?: { downloadUrl?: string; fileName?: string } }
    const url = json.data?.downloadUrl
    if (!url) throw new Error('다운로드 URL을 받지 못했습니다.')
    window.open(url, '_blank', 'noopener,noreferrer')
    return
  }
  const blob = await res.blob()
  const disposition = res.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  const fileName = match ? decodeURIComponent(match[1]) : 'download'
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = fileName
  a.click()
  URL.revokeObjectURL(objectUrl)
}
