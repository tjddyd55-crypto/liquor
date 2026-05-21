import { ApiError, apiRequest } from '../../../lib/apiClient'
import type {
  CompanyDirectoryEntry,
  CompanyUpdateHistoryItem,
  InsuranceCompanyContactDraft,
  InsuranceGeneralDraft,
} from '../domain/types'

export async function listCompanyDirectory(token: string): Promise<CompanyDirectoryEntry[]> {
  const rows = await apiRequest<CompanyDirectoryEntry[]>('/api/company/list', { token })
  return rows
}

export async function getCompanyRecentUpdates(token: string): Promise<CompanyUpdateHistoryItem[]> {
  return apiRequest<CompanyUpdateHistoryItem[]>('/api/company/recent-updates', { token })
}

export interface FullSaveCompanyBody {
  company: Record<string, unknown>
  contacts: InsuranceCompanyContactDraft[]
}

export async function fullSaveCompanyDirectory(
  body: FullSaveCompanyBody,
  token: string,
): Promise<{ success: boolean; data: CompanyDirectoryEntry | null }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ success: boolean; data: CompanyDirectoryEntry | null }>('/api/company/full-save', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

/** 원수사 마스터 하드 삭제 — 소식지 등은 DB에서 company 연결만 끊고 스냅샷 유지 */
export async function deleteHardCompanyMaster(
  companyMasterId: number,
  token: string,
): Promise<{ success: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  if (!Number.isInteger(companyMasterId) || companyMasterId < 1) {
    throw new ApiError('유효하지 않은 보험사 id입니다.', 400)
  }
  return apiRequest<{ success: boolean }>(`/api/company/masters/${companyMasterId}`, {
    method: 'DELETE',
    token,
  })
}

export async function saveGeneralRequest(
  body: {
    company: { category: string; name: string; companyCode: string }
    general: InsuranceGeneralDraft
  },
  token: string,
): Promise<{ success: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ success: boolean }>('/api/company/general-save', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}
