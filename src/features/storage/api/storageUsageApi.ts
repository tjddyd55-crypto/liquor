import { ApiError, apiRequest } from '../../../lib/apiClient'
import { listCustomers } from '../../customers/api/customersApi'
import {
  getClaimRequestDetail,
  listAgentCustomerNews,
  listClaimRequests,
  type AgentCustomerNewsItem,
} from '../../claim-requests/api/claimRequestsApi'
import { listStorageFiles, type StorageFileRow } from './storageApi'

export type StorageUsageSource = 'personal-storage' | 'customer-storage' | 'claim-file' | 'customer-news'

export type StorageUsageItem = {
  id: string
  source: StorageUsageSource
  sourceLabel: string
  fileName: string
  size: number
  createdAt: string | null
  locationLabel: string
  storageFileId?: number
  customerId?: number | null
  customerName?: string
  claimRequestId?: number
  newsId?: string
  newsScope?: 'all' | 'personal'
  canDeleteDirectly: boolean
}

export type StorageUsageSummary = {
  source: StorageUsageSource
  label: string
  count: number
  size: number
}

export type StorageUsageBreakdown = {
  items: StorageUsageItem[]
  summary: StorageUsageSummary[]
  totalCount: number
  totalSize: number
}

const BASE_SUMMARY: StorageUsageSummary[] = [
  { source: 'personal-storage', label: '내 파일', count: 0, size: 0 },
  { source: 'customer-storage', label: '고객 파일', count: 0, size: 0 },
  { source: 'claim-file', label: '청구 첨부', count: 0, size: 0 },
  { source: 'customer-news', label: '소식지 첨부', count: 0, size: 0 },
]

function fileSizeOf(row: StorageFileRow): number {
  return Number(row.fileSize ?? 0) || 0
}

function normalizeUsageBreakdown(payload: Partial<StorageUsageBreakdown> | null | undefined): StorageUsageBreakdown {
  const items = Array.isArray(payload?.items) ? payload.items : []
  const summary = buildUsageSummary(items)
  const totalSize = items.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
  return {
    items,
    summary,
    totalCount: items.length,
    totalSize,
  }
}

function buildUsageSummary(items: StorageUsageItem[]): StorageUsageSummary[] {
  const groups = BASE_SUMMARY.map((group) => ({ ...group }))
  const bySource = new Map(groups.map((group) => [group.source, group]))
  for (const item of items) {
    const group = bySource.get(item.source)
    if (!group) {
      continue
    }
    group.count += 1
    group.size += Number(item.size ?? 0) || 0
  }
  return groups
}

function mapStorageFile(row: StorageFileRow, source: StorageUsageSource, customerName?: string): StorageUsageItem {
  const isCustomer = source === 'customer-storage'
  return {
    id: `${source}:${row.id}`,
    source,
    sourceLabel: isCustomer ? '고객 파일' : '내 파일',
    fileName: row.displayName || row.fileName || row.originalName || `파일 #${row.id}`,
    size: fileSizeOf(row),
    createdAt: row.createdAt,
    locationLabel: isCustomer ? `${customerName || `고객 #${row.customerId}`} · 고객 파일` : '내 저장공간',
    storageFileId: row.id,
    customerId: row.customerId,
    customerName,
    canDeleteDirectly: true,
  }
}

function mapClaimFile(params: {
  requestId: number
  customerId: number
  customerName: string
  file: { id: number; fileName: string; fileSize: number; uploadedAt: string | null }
}): StorageUsageItem {
  return {
    id: `claim-file:${params.file.id}`,
    source: 'claim-file',
    sourceLabel: '청구 첨부',
    fileName: params.file.fileName || `청구파일 #${params.file.id}`,
    size: Number(params.file.fileSize ?? 0) || 0,
    createdAt: params.file.uploadedAt,
    locationLabel: `${params.customerName || `고객 #${params.customerId}`} · 청구 #${params.requestId}`,
    customerId: params.customerId,
    customerName: params.customerName,
    claimRequestId: params.requestId,
    canDeleteDirectly: false,
  }
}

function mapNewsAttachments(news: AgentCustomerNewsItem): StorageUsageItem[] {
  const scopeLabel = news.scope === 'personal' ? '개인 소식지' : '전체 소식지'
  return (news.attachments ?? []).map((file) => ({
    id: `customer-news:${news.id}:${file.id}`,
    source: 'customer-news' as const,
    sourceLabel: '소식지 첨부',
    fileName: file.fileName || `첨부 #${file.id}`,
    size: Number(file.size ?? 0) || 0,
    createdAt: news.updatedAt,
    locationLabel: news.targetCustomerName ? `${news.targetCustomerName} · ${scopeLabel}` : scopeLabel,
    customerId: news.targetCustomerId,
    customerName: news.targetCustomerName,
    newsId: news.id,
    newsScope: news.scope,
    canDeleteDirectly: false,
  }))
}

async function getStorageUsageBreakdownFallback(token: string): Promise<StorageUsageBreakdown> {
  const nextItems: StorageUsageItem[] = []

  const personalFiles = await listStorageFiles(token, { customerId: null })
  nextItems.push(...personalFiles.map((file) => mapStorageFile(file, 'personal-storage')))

  const { customers } = await listCustomers(token, 500)
  const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]))
  const customerFileResults = await Promise.allSettled(
    customers.map(async (customer) => {
      const files = await listStorageFiles(token, { customerId: customer.id })
      return files.map((file) => mapStorageFile(file, 'customer-storage', customer.name))
    }),
  )
  for (const result of customerFileResults) {
    if (result.status === 'fulfilled') {
      nextItems.push(...result.value)
    }
  }

  const claims = await listClaimRequests(token, { page: 1, pageSize: 100 })
  const claimDetails = await Promise.allSettled(
    claims.rows.map((row) => getClaimRequestDetail(token, row.id)),
  )
  for (const result of claimDetails) {
    if (result.status !== 'fulfilled') {
      continue
    }
    const detail = result.value
    for (const file of detail.files) {
      nextItems.push(mapClaimFile({
        requestId: detail.id,
        customerId: detail.customerId,
        customerName: detail.customerName || customerMap.get(detail.customerId) || '',
        file,
      }))
    }
  }

  const [allNews, personalNews] = await Promise.all([
    listAgentCustomerNews(token, { scope: 'all' }).catch(() => []),
    listAgentCustomerNews(token, { scope: 'personal' }).catch(() => []),
  ])
  for (const news of [...allNews, ...personalNews]) {
    nextItems.push(...mapNewsAttachments(news))
  }

  nextItems.sort((a, b) => b.size - a.size || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
  return normalizeUsageBreakdown({ items: nextItems })
}

/**
 * 저장공간 사용처 조회 단일 진입점.
 * 서버 전용 endpoint(/api/storage/usage-breakdown)가 있으면 그것을 사용하고,
 * 아직 없는 배포에서는 기존 API 조합 fallback으로 동일한 화면 계약을 유지한다.
 */
export async function getStorageUsageBreakdown(token: string): Promise<StorageUsageBreakdown> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }

  try {
    const response = await apiRequest<StorageUsageBreakdown | { data?: StorageUsageBreakdown }>(
      '/api/storage/usage-breakdown',
      { token },
    )
    const payload = response && typeof response === 'object' && 'data' in response ? response.data : response
    return normalizeUsageBreakdown(payload as StorageUsageBreakdown)
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 405)) {
      return getStorageUsageBreakdownFallback(token)
    }
    throw error
  }
}
