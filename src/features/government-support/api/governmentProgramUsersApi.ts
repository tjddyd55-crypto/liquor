import { apiRequest } from '../../../lib/apiClient'

/** 이용자 계정·상태만 — 사업장/고객/신청 원본 미포함 */
export type GovernmentProgramUserDetail = {
  id: string
  username: string
  displayName: string
  status: string
  createdAt: string | null
  lastLoginAt: string | null
  tenantId: string | null
  tenantName: string
  agencyCode: string
  role: string
  profilesAccessible: boolean
  profilesAccessNote: string
}

function unwrapData<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.data && typeof o.data === 'object') return o.data as T
  return raw as T
}

export async function fetchGovernmentProgramUserDetail(
  token: string,
  userId: string,
): Promise<GovernmentProgramUserDetail> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/admin/program-users/${encodeURIComponent(userId)}`,
    { method: 'GET', token },
  )
  const row = unwrapData<GovernmentProgramUserDetail>(raw)
  if (!row) throw new Error('이용자 정보를 불러오지 못했습니다.')
  return row
}
