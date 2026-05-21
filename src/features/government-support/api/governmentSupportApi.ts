import { apiRequest } from '../../../lib/apiClient'

export type GovernmentAccessSummary = {
  userId: string
  isSuperAdmin: boolean
  isGovernmentIndustryAdmin: boolean
  isGovernmentTenantMember: boolean
  governmentIndustryAdminIndustryIds: string[]
  governmentAgencyAdminTenantIds: string[]
  governmentStaffTenantIds: string[]
  /** 기관 코드 가입 프로그램 이용자 tenant */
  governmentProgramUserTenantIds: string[]
  isGovernmentProgramUser: boolean
  /** 워크스페이스·프로필 생성에 사용 가능한 tenant id 목록 */
  workspaceTenantIds: string[]
  defaultWorkspaceTenantId: string | null
  /** 프로그램 이용자 소속 대행사명 (me/access) */
  programUserTenantName: string | null
  /** 계정 가입일 ISO (me/access) */
  accountCreatedAt: string | null
}

function unwrapAccessPayload(raw: unknown): GovernmentAccessSummary | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const nested = o.data
  const row =
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? (nested as Record<string, unknown>)
      : o
  const userId = typeof row.userId === 'string' ? row.userId : ''
  return {
    userId,
    isSuperAdmin: row.isSuperAdmin === true,
    isGovernmentIndustryAdmin: row.isGovernmentIndustryAdmin === true,
    isGovernmentTenantMember: row.isGovernmentTenantMember === true,
    governmentIndustryAdminIndustryIds: Array.isArray(row.governmentIndustryAdminIndustryIds)
      ? row.governmentIndustryAdminIndustryIds.map(String)
      : [],
    governmentAgencyAdminTenantIds: Array.isArray(row.governmentAgencyAdminTenantIds)
      ? row.governmentAgencyAdminTenantIds.map(String)
      : [],
    governmentStaffTenantIds: Array.isArray(row.governmentStaffTenantIds)
      ? row.governmentStaffTenantIds.map(String)
      : [],
    governmentProgramUserTenantIds: Array.isArray(row.governmentProgramUserTenantIds)
      ? row.governmentProgramUserTenantIds.map(String)
      : [],
    isGovernmentProgramUser: row.isGovernmentProgramUser === true,
    workspaceTenantIds: Array.isArray(row.workspaceTenantIds)
      ? row.workspaceTenantIds.map(String)
      : [],
    defaultWorkspaceTenantId:
      row.defaultWorkspaceTenantId != null && String(row.defaultWorkspaceTenantId).trim()
        ? String(row.defaultWorkspaceTenantId).trim()
        : null,
    programUserTenantName:
      row.programUserTenantName != null && String(row.programUserTenantName).trim()
        ? String(row.programUserTenantName).trim()
        : null,
    accountCreatedAt:
      row.accountCreatedAt != null && String(row.accountCreatedAt).trim()
        ? String(row.accountCreatedAt).trim()
        : null,
  }
}

export async function fetchGovernmentAccessSummary(token: string): Promise<GovernmentAccessSummary> {
  const raw = await apiRequest<unknown>('/api/government-support/me/access', {
    method: 'GET',
    token,
  })
  const parsed = unwrapAccessPayload(raw)
  if (!parsed) {
    throw new Error('government-support 접근 정보를 불러오지 못했습니다.')
  }
  return parsed
}
