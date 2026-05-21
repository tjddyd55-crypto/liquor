import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'

export type ClaimRequestStatus = 'requested' | 'processing' | 'done' | 'rejected' | 'canceled'

export interface ClaimRequestListItem {
  id: number
  customerId: number
  deviceId: string
  customerName: string
  requesterName: string
  requesterBirthDate: string
  requesterPhone: string
  status: ClaimRequestStatus
  title: string
  memo: string
  submittedAt: string | null
  fileCount: number
}

export interface ClaimRequestFileItem {
  id: number
  storageKey: string
  fileName: string
  contentType: string
  fileSize: number
  sortOrder: number
  uploadedAt: string | null
  url: string
  downloadUrl?: string
}

function parseContentDispositionFilename(headerValue: string | null): string | null {
  if (!headerValue?.trim()) {
    return null
  }
  const utf8Star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;\s]+)/i.exec(headerValue)
  if (utf8Star?.[1]) {
    try {
      return decodeURIComponent(utf8Star[1].trim())
    } catch {
      return null
    }
  }
  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(headerValue)
  if (quoted?.[1]) {
    return quoted[1].replace(/\\(.)/g, '$1')
  }
  const plain = /filename\s*=\s*([^;\s]+)/i.exec(headerValue)
  if (plain?.[1]) {
    return plain[1].replace(/^["']|["']$/g, '')
  }
  return null
}

function isDirectCdnUrl(url: string): boolean {
  const trimmed = url.trim()
  if (!trimmed) {
    return false
  }
  return !/\/(backend|api)\/(agent|customer-app)\/customer-claim-files\/\d+\/download/i.test(trimmed)
}

function triggerBrowserDownload(url: string, fileName: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  // 다운로드는 업무 화면을 벗어나면 안 되므로 target="_blank"를 사용하지 않는다.
  document.body.appendChild(a)
  a.click()
  a.remove()
}

async function fetchAgentClaimFileBlob(
  token: string,
  fileId: number,
  mode: 'inline' | 'attachment',
): Promise<{ blob: Blob; fileName: string | null }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const query = mode === 'attachment' ? '?download=1' : ''
  const url = resolveApiUrl(`/api/agent/customer-claim-files/${fileId}/download-auth${query}`)
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
    },
  })
  if (!response.ok) {
    let message = '파일을 불러오지 못했습니다.'
    try {
      const payload = (await response.json()) as { message?: string }
      if (payload?.message) {
        message = payload.message
      }
    } catch {
      // ignore json parse error
    }
    throw new ApiError(message, response.status)
  }
  return {
    blob: await response.blob(),
    fileName: parseContentDispositionFilename(response.headers.get('Content-Disposition')),
  }
}

export async function openClaimRequestFile(token: string, file: ClaimRequestFileItem): Promise<void> {
  const directUrl = String(file.url ?? '').trim()
  if (directUrl && isDirectCdnUrl(directUrl)) {
    window.open(directUrl, '_blank', 'noopener,noreferrer')
    return
  }
  const { blob } = await fetchAgentClaimFileBlob(token, file.id, 'inline')
  const objectUrl = URL.createObjectURL(blob)
  window.open(objectUrl, '_blank', 'noopener,noreferrer')
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
}

export async function downloadClaimRequestFile(token: string, file: ClaimRequestFileItem): Promise<void> {
  const fileName = file.fileName ?? `claim-file-${file.id}`

  try {
    const { blob, fileName: responseFileName } = await fetchAgentClaimFileBlob(token, file.id, 'attachment')
    const objectUrl = URL.createObjectURL(blob)
    triggerBrowserDownload(objectUrl, responseFileName ?? fileName)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    return
  } catch (downloadError) {
    const fallbackUrl = String(file.downloadUrl ?? file.url ?? '').trim()
    if (!fallbackUrl || !isDirectCdnUrl(fallbackUrl)) {
      throw downloadError
    }
    triggerBrowserDownload(fallbackUrl, fileName)
  }
}

export interface ClaimRequestStatusLogItem {
  id: number
  fromStatus: ClaimRequestStatus | null
  toStatus: ClaimRequestStatus
  changedByUserId: string | null
  changedAt: string | null
  memo: string
}

export interface ClaimRequestDetail {
  id: number
  agentId: string
  customerId: number
  customerName: string
  requesterName: string
  requesterBirthDate: string
  requesterPhone: string
  deviceId: string
  status: ClaimRequestStatus
  title: string
  memo: string
  requestType: string
  submittedAt: string | null
  processedAt: string | null
  files: ClaimRequestFileItem[]
  statusLogs: ClaimRequestStatusLogItem[]
}

export interface CustomerAppLinkInfo {
  connectionState?: 'not_created' | 'link_created' | 'connected' | 'expired'
  linkId?: number
  linkCode?: string
  agentCode?: string
  connectUrl?: string
  universalUrl?: string
  customerId?: number
  customerCode?: string
  status?: string
  createdAt?: string | null
  expiresAt?: string | null
  lastConnectedAt?: string | null
  deviceCount?: number
}

export interface LinkedCustomerItem {
  customerId: number
  customerName: string
  lastConnectedAt: string | null
  deviceCount: number
}

export interface AgentCustomerNewsItem {
  id: string
  title: string
  content: string
  updatedAt: string | null
  isPinned: boolean
  heroImageUrl?: string | null
  attachments?: Array<{
    id: string
    kind: 'image' | 'file'
    url: string
    fileName: string
    sortOrder: number
    objectKey?: string
    mimeType?: string
    size?: number
  }>
  scope: 'all' | 'personal'
  targetCustomerId: number | null
  targetCustomerName: string
}

export async function createCustomerAppLink(token: string, customerId: number): Promise<CustomerAppLinkInfo> {
  const response = await apiRequest<{ success: true; data: CustomerAppLinkInfo }>('/api/agent/customer-app-links', {
    method: 'POST',
    token,
    body: JSON.stringify({ customerId }),
  })
  return response as CustomerAppLinkInfo
}

export async function getCustomerAppLink(token: string, customerId: number): Promise<CustomerAppLinkInfo | null> {
  const response = await apiRequest<{ success: true; data: CustomerAppLinkInfo | null }>(
    `/api/agent/customers/${customerId}/customer-app-link`,
    { token },
  )
  return response as CustomerAppLinkInfo | null
}

export async function listClaimRequests(
  token: string,
  params: { status?: ClaimRequestStatus | ''; customerId?: number | null; page?: number; pageSize?: number } = {},
): Promise<{ rows: ClaimRequestListItem[]; total: number; page: number; pageSize: number }> {
  const search = new URLSearchParams()
  if (params.status) {
    search.set('status', params.status)
  }
  if (params.customerId && Number.isInteger(params.customerId) && params.customerId > 0) {
    search.set('customerId', String(params.customerId))
  }
  if (params.page && params.page > 0) {
    search.set('page', String(params.page))
  }
  if (params.pageSize && params.pageSize > 0) {
    search.set('pageSize', String(params.pageSize))
  }
  const query = search.toString()
  const response = await apiRequest<{
    success: true
    data: { rows: ClaimRequestListItem[]; total: number; page: number; pageSize: number }
  }>(`/api/agent/customer-claim-requests${query ? `?${query}` : ''}`, { token })
  return response as { rows: ClaimRequestListItem[]; total: number; page: number; pageSize: number }
}

export async function getClaimRequestDetail(token: string, requestId: number): Promise<ClaimRequestDetail> {
  const response = await apiRequest<{ success: true; data: ClaimRequestDetail }>(
    `/api/agent/customer-claim-requests/${requestId}`,
    { token },
  )
  return response as ClaimRequestDetail
}

export async function updateClaimRequestStatus(
  token: string,
  requestId: number,
  payload: { status: ClaimRequestStatus; memo?: string },
): Promise<{ requestId: number; status: ClaimRequestStatus; fromStatus: ClaimRequestStatus; memo: string }> {
  const response = await apiRequest<{
    success: true
    data: { requestId: number; status: ClaimRequestStatus; fromStatus: ClaimRequestStatus; memo: string }
  }>(`/api/agent/customer-claim-requests/${requestId}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
  return response as { requestId: number; status: ClaimRequestStatus; fromStatus: ClaimRequestStatus; memo: string }
}

export async function createCustomerNews(
  token: string,
  payload: {
    title: string
    content: string
    scope?: 'all' | 'personal'
    targetCustomerId?: number | null
    sendPush?: boolean
    isPinned?: boolean
    attachments?: Array<{
      kind: 'image' | 'file'
      url: string
      objectKey?: string
      fileName: string
      mimeType?: string
      size?: number
      sortOrder?: number
    }>
  },
): Promise<{ id: string }> {
  const response = await apiRequest<{ success: true; data: { id: string } }>('/api/agent/customer-news', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
  return response as { id: string }
}

export async function updateCustomerNews(
  token: string,
  newsId: string,
  payload: {
    title: string
    content: string
    sendPush?: boolean
    attachments?: Array<{
      kind: 'image' | 'file'
      url: string
      objectKey?: string
      fileName: string
      mimeType?: string
      size?: number
      sortOrder?: number
    }>
  },
): Promise<{ id: string }> {
  const id = String(newsId ?? '').trim()
  if (!id) {
    throw new ApiError('소식지 ID가 필요합니다.', 400)
  }
  const response = await apiRequest<{ success: true; data: { id: string } }>(
    `/api/agent/customer-news/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    },
  )
  return response as { id: string }
}

export async function deleteCustomerNews(
  token: string,
  newsId: string | number,
  params: { targetCustomerId?: number | null } = {},
): Promise<{ id: string }> {
  const id = String(newsId ?? '').trim()
  if (!id) {
    throw new ApiError('삭제할 소식지를 선택해 주세요.', 400)
  }
  const search = new URLSearchParams()
  if (params.targetCustomerId && Number.isInteger(params.targetCustomerId) && params.targetCustomerId > 0) {
    search.set('targetCustomerId', String(params.targetCustomerId))
  }
  const query = search.toString()
  const response = await apiRequest<{ success: true; data: { id: string } }>(
    `/api/agent/customer-news/${encodeURIComponent(id)}${query ? `?${query}` : ''}`,
    {
      method: 'DELETE',
      token,
    },
  )
  return response as { id: string }
}

export async function listLinkedCustomers(token: string): Promise<LinkedCustomerItem[]> {
  const response = await apiRequest<{ success: true; data: LinkedCustomerItem[] }>(
    '/api/agent/customer-app-linked-customers',
    { token },
  )
  return response as LinkedCustomerItem[]
}

export async function listAgentCustomerNews(
  token: string,
  params: { scope?: 'all' | 'personal'; targetCustomerId?: number | null } = {},
): Promise<AgentCustomerNewsItem[]> {
  const search = new URLSearchParams()
  if (params.scope) {
    search.set('scope', params.scope)
  }
  if (params.targetCustomerId && Number.isInteger(params.targetCustomerId) && params.targetCustomerId > 0) {
    search.set('targetCustomerId', String(params.targetCustomerId))
  }
  const response = await apiRequest<{ success: true; data: AgentCustomerNewsItem[] }>(
    `/api/agent/customer-news${search.toString() ? `?${search.toString()}` : ''}`,
    { token },
  )
  return response as AgentCustomerNewsItem[]
}
