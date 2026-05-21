import { apiRequest } from '../../../lib/apiClient'

export type CustomerNewsCommentAuthorType = 'agent' | 'customer'

export interface CustomerNewsCommentItem {
  id: string
  newsId: string
  authorType: CustomerNewsCommentAuthorType
  authorName: string
  content: string
  createdAt: string | null
}

function normalizeComment(row: CustomerNewsCommentItem): CustomerNewsCommentItem {
  const authorType = row.authorType === 'customer' ? 'customer' : 'agent'
  return {
    id: String(row.id ?? ''),
    newsId: String(row.newsId ?? ''),
    authorType,
    authorName: String(row.authorName ?? (authorType === 'customer' ? '고객' : '담당자')),
    content: String(row.content ?? ''),
    createdAt: row.createdAt ?? null,
  }
}

export async function listCustomerNewsComments(
  token: string,
  newsId: string | number,
): Promise<CustomerNewsCommentItem[]> {
  const id = encodeURIComponent(String(newsId ?? '').trim())
  if (!id) {
    return []
  }
  const response = await apiRequest<{ success: true; data: CustomerNewsCommentItem[] }>(
    `/api/agent/customer-news/${id}/comments`,
    { token },
  )
  return Array.isArray(response) ? response.map(normalizeComment) : []
}

export async function createCustomerNewsComment(
  token: string,
  newsId: string | number,
  content: string,
): Promise<CustomerNewsCommentItem> {
  const id = encodeURIComponent(String(newsId ?? '').trim())
  const response = await apiRequest<{ success: true; data: CustomerNewsCommentItem }>(
    `/api/agent/customer-news/${id}/comments`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ content }),
    },
  )
  return normalizeComment(response as CustomerNewsCommentItem)
}
