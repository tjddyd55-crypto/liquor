/**
 * 전역 공통 보험사 설계사이트 API 클라이언트.
 * 서버: `server/registerInsurerSitesApi.js`
 */

import { apiRequest, resolveApiUrl } from '../../../lib/apiClient'

export type InsurerSiteCategory = 'non_life' | 'life'

export interface InsurerSite {
  id: number
  category: InsurerSiteCategory
  name: string
  logoPath: string
  salesUrl: string
  homepageUrl: string
  disclosureUrl: string
  claimUrl: string
  sortOrder: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export interface InsurerSitesListResponse {
  ok: boolean
  items: InsurerSite[]
}

export interface InsurerSiteItemResponse {
  ok: boolean
  item: InsurerSite
}

export async function fetchActiveInsurerSites(
  token: string,
  category?: InsurerSiteCategory | '',
): Promise<InsurerSitesListResponse> {
  const q = category && (category === 'life' || category === 'non_life') ? `?category=${category}` : ''
  return apiRequest(`/api/insurer-sites${q}`, { token }) as Promise<InsurerSitesListResponse>
}

export async function fetchAdminInsurerSites(
  token: string,
  opts?: { category?: InsurerSiteCategory | ''; q?: string },
): Promise<InsurerSitesListResponse> {
  const sp = new URLSearchParams()
  if (opts?.category === 'life' || opts?.category === 'non_life') {
    sp.set('category', opts.category)
  }
  if (opts?.q?.trim()) sp.set('q', opts.q.trim())
  const q = sp.toString() ? `?${sp.toString()}` : ''
  return apiRequest(`/api/admin/insurer-sites${q}`, { token }) as Promise<InsurerSitesListResponse>
}

export async function createAdminInsurerSite(
  token: string,
  body: {
    category: InsurerSiteCategory
    name: string
    logoPath?: string
    salesUrl?: string
    homepageUrl?: string
    disclosureUrl?: string
    claimUrl?: string
    sortOrder?: number
    isActive?: boolean
  },
): Promise<InsurerSiteItemResponse> {
  return apiRequest('/api/admin/insurer-sites', {
    token,
    method: 'POST',
    body: JSON.stringify(body),
  }) as Promise<InsurerSiteItemResponse>
}

export async function patchAdminInsurerSite(
  token: string,
  id: number,
  body: Partial<{
    category: InsurerSiteCategory
    name: string
    logoPath: string
    salesUrl: string
    homepageUrl: string
    disclosureUrl: string
    claimUrl: string
    sortOrder: number
    isActive: boolean
  }>,
): Promise<InsurerSiteItemResponse> {
  return apiRequest(`/api/admin/insurer-sites/${id}`, {
    token,
    method: 'PATCH',
    body: JSON.stringify(body),
  }) as Promise<InsurerSiteItemResponse>
}

export async function deactivateAdminInsurerSite(
  token: string,
  id: number,
): Promise<InsurerSiteItemResponse> {
  return apiRequest(`/api/admin/insurer-sites/${id}/deactivate`, {
    token,
    method: 'POST',
    body: JSON.stringify({}),
  }) as Promise<InsurerSiteItemResponse>
}

export async function uploadAdminInsurerLogo(
  token: string,
  id: number,
  file: File,
): Promise<InsurerSiteItemResponse> {
  const fd = new FormData()
  fd.append('logo', file)
  const url = resolveApiUrl(`/api/admin/insurer-sites/${id}/logo`)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
    },
    body: fd,
  })
  const payload = (await res.json().catch(() => ({}))) as InsurerSiteItemResponse & {
    error?: string
    message?: string
  }
  if (!res.ok) {
    throw new Error(payload.message ?? payload.error ?? '로고 업로드에 실패했습니다.')
  }
  return payload
}
