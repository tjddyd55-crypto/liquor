import { apiRequest } from '../../../lib/apiClient'
import { coercePositiveIntId } from '../../../lib/numericIds'
import type {
  AssignPlatformIndustryAdminResult,
  AssignPlatformTenantAdminResult,
  CreateIndustryInput,
  CreateIndustryResponse,
  CreatePlatformTenantInput,
  CreatePlatformTenantResponse,
  CreatePlatformTenantStaffUserInput,
  CreateTenantRegistrationCodeInput,
  PatchPlatformTenantSeatBillingInput,
  PatchPlatformTenantStaffUserInput,
  PatchTenantRegistrationCodeInput,
  PlatformAccessMode,
  PlatformAccessSummary,
  PlatformExternalAccountsSummaryResponse,
  PlatformIndustriesResponse,
  PlatformIndustryAdminsResponse,
  PlatformMembershipsResponse,
  PlatformTenantRegistrationCode,
  PlatformTenantRegistrationCodesResponse,
  PlatformTenantRow,
  PlatformTenantAdminsResponse,
  PlatformTenantMembersResponse,
  PlatformTenantsResponse,
  PlatformTenantStaffUser,
  PlatformTenantStaffUsersResponse,
  PlatformUserSearchResponse,
  AssignPlatformTenantMemberResult,
  PlatformTenantMembershipRole,
} from '../platformAdmin.types'

const PLATFORM_ACCESS_MODES: readonly PlatformAccessMode[] = [
  'platform',
  'industry',
  'tenant',
  'work',
]

function isPlatformAccessMode(v: unknown): v is PlatformAccessMode {
  return typeof v === 'string' && (PLATFORM_ACCESS_MODES as readonly string[]).includes(v)
}

function ensureStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return []
  }
  return raw.map((x) => String(x))
}

/** 서버 페이로드를 클라에서 안전한 `PlatformAccessSummary` 로 통일한다. */
export function normalizePlatformAccessSummary(raw: unknown): PlatformAccessSummary {
  const o =
    raw != null && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const availableModes = ensureStringArray(o.availableModes).filter(isPlatformAccessMode)
  let defaultMode: PlatformAccessMode | null = null
  if (o.defaultMode != null && isPlatformAccessMode(o.defaultMode)) {
    defaultMode = availableModes.includes(o.defaultMode) ? o.defaultMode : null
  }

  return {
    userId: typeof o.userId === 'string' ? o.userId.trim() : String(o.userId ?? '').trim(),
    legacyRole:
      typeof o.legacyRole === 'string'
        ? o.legacyRole.trim()
        : String(o.legacyRole ?? '').trim(),
    isSuperAdmin: o.isSuperAdmin === true,
    availableModes,
    defaultMode,
    industryAdminIndustryIds: ensureStringArray(o.industryAdminIndustryIds),
    tenantAdminTenantIds: ensureStringArray(o.tenantAdminTenantIds),
    staffTenantIds: ensureStringArray(o.staffTenantIds),
    userTenantIds: ensureStringArray(o.userTenantIds),
    workTenantIds: ensureStringArray(o.workTenantIds),
  }
}

export async function fetchPlatformAccessSummary(token: string): Promise<PlatformAccessSummary> {
  const raw = await apiRequest<unknown>('/api/admin/platform/me/access', { method: 'GET', token })
  return normalizePlatformAccessSummary(raw)
}

export function fetchPlatformIndustries(token: string) {
  return apiRequest<PlatformIndustriesResponse>('/api/admin/platform/industries', { method: 'GET', token })
}

export function createIndustry(token: string, input: CreateIndustryInput) {
  const payload = {
    code: input.code,
    name: input.name,
    status: input.status,
    config: input.config ?? {},
  }
  return apiRequest<CreateIndustryResponse>('/api/admin/platform/industries', {
    method: 'POST',
    body: JSON.stringify(payload),
    token,
  })
}

export function fetchPlatformIndustryAdmins(token: string, industryId: string) {
  const id = encodeURIComponent(industryId)
  return apiRequest<PlatformIndustryAdminsResponse>(
    `/api/admin/platform/industries/${id}/admins`,
    {
      method: 'GET',
      token,
    },
  )
}

export function assignPlatformIndustryAdmin(
  token: string,
  industryId: string,
  body: { userId: string },
) {
  const id = encodeURIComponent(industryId)
  return apiRequest<AssignPlatformIndustryAdminResult>(`/api/admin/platform/industries/${id}/admins`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  })
}

function normalizeTenantRows(items: PlatformTenantRow[]): PlatformTenantRow[] {
  return items.map((row) => ({
    ...row,
    crmCustomerTemplateId: coercePositiveIntId(row.crmCustomerTemplateId),
    seatLimit:
      row.seatLimit === undefined
        ? undefined
        : row.seatLimit === null
          ? null
          : Number(row.seatLimit),
    activeSeatCount: Number(row.activeSeatCount ?? 0) || 0,
    remainingSeats:
      row.remainingSeats === undefined
        ? undefined
        : row.remainingSeats === null
          ? null
          : Number(row.remainingSeats),
    licensePolicy: row.licensePolicy ?? {
      maxConcurrentSessionsPerUser: null,
      maxRegisteredDevicesPerUser: null,
    },
    billingEntitlement:
      typeof row.billingEntitlement === 'object' &&
      row.billingEntitlement != null &&
      !Array.isArray(row.billingEntitlement)
        ? row.billingEntitlement
        : {},
  }))
}

export function fetchPlatformTenants(token: string) {
  return apiRequest<PlatformTenantsResponse>('/api/admin/platform/tenants', { method: 'GET', token }).then((r) => ({
    items: normalizeTenantRows(r.items),
  }))
}

/** 업종별 스코프 — 응답 스키마는 전체 목록 GET 과 동일 */
export function fetchPlatformTenantsForIndustry(token: string, industryId: string) {
  const id = encodeURIComponent(industryId)
  return apiRequest<PlatformTenantsResponse>(`/api/admin/platform/industries/${id}/tenants`, {
    method: 'GET',
    token,
  }).then((r) => ({ items: normalizeTenantRows(r.items) }))
}

export function fetchPlatformTenantAdmins(token: string, tenantId: string) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantAdminsResponse>(`/api/admin/platform/tenants/${id}/admins`, {
    method: 'GET',
    token,
  })
}

export function assignPlatformTenantAdmin(
  token: string,
  tenantId: string,
  body: { userId: string },
) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<AssignPlatformTenantAdminResult>(`/api/admin/platform/tenants/${id}/admins`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  })
}

export function fetchPlatformTenantMembers(
  token: string,
  tenantId: string,
  opts?: { membershipRole?: PlatformTenantMembershipRole },
) {
  const id = encodeURIComponent(tenantId)
  const sp = new URLSearchParams()
  if (opts?.membershipRole) {
    sp.set('membershipRole', opts.membershipRole)
  }
  const qs = sp.toString()
  const path = qs ? `/api/admin/platform/tenants/${id}/members?${qs}` : `/api/admin/platform/tenants/${id}/members`
  return apiRequest<PlatformTenantMembersResponse>(path, { method: 'GET', token })
}

export function assignPlatformTenantMember(
  token: string,
  tenantId: string,
  body: { userId: string; membershipRole: PlatformTenantMembershipRole },
) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<AssignPlatformTenantMemberResult>(`/api/admin/platform/tenants/${id}/members`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  })
}

export function createPlatformTenant(token: string, industryId: string, input: CreatePlatformTenantInput) {
  const id = encodeURIComponent(industryId)
  const body: Record<string, unknown> = {
    code: input.code,
    name: input.name,
    status: input.status,
    config: {},
  }
  if (input.legacyGaId != null && Number.isInteger(input.legacyGaId) && input.legacyGaId > 0) {
    body.legacyGaId = input.legacyGaId
  }
  return apiRequest<CreatePlatformTenantResponse>(`/api/admin/platform/industries/${id}/tenants`, {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  })
}

/** 좌석·라이선스 정책·청구 메타(요금 라인은 자유 JSON) */
export function patchPlatformTenantSeatBilling(
  token: string,
  industryId: string,
  tenantId: string,
  input: PatchPlatformTenantSeatBillingInput,
) {
  const encInd = encodeURIComponent(industryId)
  const encT = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantRow>(
    `/api/admin/platform/industries/${encInd}/tenants/${encT}/seat-billing`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
      token,
    },
  ).then((row) =>
    normalizeTenantRows([row])[0],
  )
}

export function fetchPlatformMemberships(token: string) {
  return apiRequest<PlatformMembershipsResponse>('/api/admin/platform/memberships', { method: 'GET', token })
}

export function fetchPlatformExternalSummary(token: string) {
  return apiRequest<PlatformExternalAccountsSummaryResponse>('/api/admin/platform/external-accounts/summary', {
    method: 'GET',
    token,
  })
}

/** 플랫폼 사용자 검색(Super Admin 전용 API) */
export function searchPlatformUsers(token: string, params: { q: string; limit?: number }) {
  const sp = new URLSearchParams()
  sp.set('q', params.q)
  if (params.limit != null) {
    sp.set('limit', String(params.limit))
  }
  return apiRequest<PlatformUserSearchResponse>(`/api/admin/platform/users/search?${sp.toString()}`, {
    method: 'GET',
    token,
  })
}

export function fetchPlatformTenantSummary(token: string, tenantId: string) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantRow>(`/api/admin/platform/tenants/${id}`, { method: 'GET', token }).then((row) =>
    normalizeTenantRows([row])[0],
  )
}

export function fetchPlatformTenantStaffUsers(token: string, tenantId: string) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantStaffUsersResponse>(`/api/admin/platform/tenants/${id}/users`, {
    method: 'GET',
    token,
  })
}

export function createPlatformTenantStaffUser(
  token: string,
  tenantId: string,
  input: CreatePlatformTenantStaffUserInput,
) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<{ userId: string; username: string }>(`/api/admin/platform/tenants/${id}/users`, {
    method: 'POST',
    body: JSON.stringify({
      username: input.username,
      displayName: input.displayName,
      password: input.password,
      rbacRole: input.rbacRole,
      membershipType: input.membershipType,
      customerAccess: input.customerAccess,
      ...(input.status != null ? { status: input.status } : {}),
      ...(input.membershipStatus != null ? { membershipStatus: input.membershipStatus } : {}),
    }),
    token,
  })
}

export function patchPlatformTenantStaffUser(
  token: string,
  tenantId: string,
  userId: string,
  input: PatchPlatformTenantStaffUserInput,
) {
  const tid = encodeURIComponent(tenantId)
  const uid = encodeURIComponent(userId)
  const body = {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    ...(input.rbacRole !== undefined ? { rbacRole: input.rbacRole } : {}),
    ...(input.membershipType !== undefined ? { membershipType: input.membershipType } : {}),
    ...(input.customerAccess !== undefined ? { customerAccess: input.customerAccess } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    ...(input.membershipStatus !== undefined ? { membershipStatus: input.membershipStatus } : {}),
  }
  return apiRequest<PlatformTenantStaffUser>(`/api/admin/platform/tenants/${tid}/users/${uid}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    token,
  })
}

export function patchPlatformTenantStaffUserStatus(token: string, tenantId: string, userId: string, status: string) {
  const tid = encodeURIComponent(tenantId)
  const uid = encodeURIComponent(userId)
  return apiRequest<PlatformTenantStaffUser>(`/api/admin/platform/tenants/${tid}/users/${uid}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    token,
  })
}

function normalizeTenantRegCode(raw: PlatformTenantRegistrationCode): PlatformTenantRegistrationCode {
  return {
    ...raw,
    maxUses:
      raw.maxUses === undefined
        ? null
        : raw.maxUses === null
          ? null
          : Number(raw.maxUses),
    usedCount: Number(raw.usedCount ?? 0) || 0,
  }
}

export function fetchTenantRegistrationCodes(token: string, tenantId: string) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantRegistrationCodesResponse>(
    `/api/admin/platform/tenants/${id}/registration-codes`,
    { method: 'GET', token },
  ).then((r) => ({ items: r.items.map(normalizeTenantRegCode) }))
}

export function createTenantRegistrationCode(
  token: string,
  tenantId: string,
  input: CreateTenantRegistrationCodeInput,
) {
  const id = encodeURIComponent(tenantId)
  return apiRequest<PlatformTenantRegistrationCode>(`/api/admin/platform/tenants/${id}/registration-codes`, {
    method: 'POST',
    body: JSON.stringify({
      code: input.code,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt,
    }),
    token,
  }).then(normalizeTenantRegCode)
}

export function patchTenantRegistrationCode(
  token: string,
  tenantId: string,
  codeId: string,
  input: PatchTenantRegistrationCodeInput,
) {
  const tid = encodeURIComponent(tenantId)
  const cid = encodeURIComponent(codeId)
  return apiRequest<PlatformTenantRegistrationCode>(
    `/api/admin/platform/tenants/${tid}/registration-codes/${cid}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
      token,
    },
  ).then(normalizeTenantRegCode)
}
