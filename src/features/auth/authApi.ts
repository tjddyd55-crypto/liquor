import { ApiError, apiRequest, resolveApiUrl } from '../../lib/apiClient'
import type { TenantCrmConfig } from '../customer-templates/customerTemplate.types'
import {
  normalizeSubscriptionFromApi,
  type SubscriptionSnapshot,
} from '../subscription/policy'

/**
 * 서버 /api/login, /api/me 응답에 포함되는 subscription 필드의 원시(raw) 모양.
 *
 * 서버가 snake_case 로 내려주는 그대로의 타입이며, 프론트 내부에서는
 * policy.ts 의 `normalizeSubscriptionFromApi` 로 SubscriptionSnapshot 으로 정규화해 사용한다.
 */
export interface SubscriptionResponsePayload {
  plan?: string | null
  effective_status?: string | null
  started_at?: string | null
  expires_at?: string | null
  remaining_days?: number | null
  reason?: string | null
  policy_active?: boolean | null
}

export type UserRole = 'SUPER_ADMIN' | 'GA_ADMIN' | 'GA_STAFF' | 'USER' | 'INSURER_MANAGER' | 'LOSS_ADJUSTER'

export interface AuthUser {
  id: string
  username: string
  role: UserRole
  gaId: number
  /** ga_companies.code (대문자). 구세션·JWT에는 없을 수 있음 → 빈 문자열 */
  gaCode: string
  /** ga_companies.name (표시용). 구세션에는 없을 수 있음 */
  gaName: string
  /** insurance_company_master.id — INSURER_MANAGER 에서만 필수 */
  companyId: number | null
  displayName: string
  /** users.team_id (팀 소속). 미소속이면 null */
  teamId: string | null
  /**
   * 서버가 내려준 구독 스냅샷(정규화 후).
   * 구세션/비대상 역할에서는 null 또는 undefined 로 남는다.
   */
  subscription?: SubscriptionSnapshot | null
  /** 서버가 내려준 동적 CRM 템플릿 JSON(로그인 브리지), useCustomerCrmIndustryContext 에서 parse */
  crmDynamicIndustryTemplate?: unknown

  /**
   * 로그인 시 테넌트·업종 브리지(`crm_industry_code`). 없거나 null 이면 보험 템플릿 폴백.
   */
  crmIndustryCode?: string | null
  /** tenants.config.crm 패치 */
  tenantCrm?: TenantCrmConfig | null
}

export interface LoginResponse {
  token: string
  user: {
    id: string
    username: string
    role: UserRole
    ga_id: number | null
    ga_code?: string
    ga_name?: string
    company_id?: number | null
    display_name?: string | null
    team_id?: string | null
    subscription?: SubscriptionResponsePayload | null
    crm_industry_code?: string | null
    tenant_crm?: unknown
    crm_dynamic_industry_template?: unknown
  }
}

export type EntityStatus = 'active' | 'blocked' | 'inactive'

export interface GaCompanyRow {
  id: number
  name: string
  code: string
  status: EntityStatus
  created_at: string
}

export interface GaHistoryRow {
  id: number
  ga_id: number
  old_code: string
  new_code: string
  old_name: string
  new_name: string
  changed_by: string
  changed_at: string
}

export async function listGaCompanies(token: string): Promise<GaCompanyRow[]> {
  return apiRequest<GaCompanyRow[]>('/api/admin/ga', { method: 'GET', token })
}

/** 원수사 담당자 ↔ 보험사 마스터 정합성(감시용). SUPER_ADMIN 은 전체, 그 외는 소속 GA 만 */
export interface InsurerManagersHealth {
  total: number
  broken: number
  invalidCategory: number
  nullCompany: number
  fkBroken: number
  gaMismatch: number
}

export async function fetchInsurerManagersHealth(token: string): Promise<InsurerManagersHealth> {
  return apiRequest<InsurerManagersHealth>('/api/admin/health/insurer-managers', {
    method: 'GET',
    token,
  })
}

export interface SecurityAuditLogRow {
  id: string | number
  actor_user_id: string
  actor_role: string
  action: string
  target_type: string | null
  target_id: string | null
  ga_id: number | null
  company_id: number | null
  meta: unknown
  created_at: string
}

export async function fetchSecurityAuditLogs(
  token: string,
  params?: { limit?: number; action?: string; actor_user_id?: string; since?: string },
): Promise<SecurityAuditLogRow[]> {
  const q = new URLSearchParams()
  if (params?.limit != null) {
    q.set('limit', String(params.limit))
  }
  if (params?.action?.trim()) {
    q.set('action', params.action.trim())
  }
  if (params?.actor_user_id?.trim()) {
    q.set('actor_user_id', params.actor_user_id.trim())
  }
  if (params?.since?.trim()) {
    q.set('since', params.since.trim())
  }
  const qs = q.toString()
  return apiRequest<SecurityAuditLogRow[]>(`/api/admin/audit-logs${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    token,
  })
}

/** 서버와 동일 규칙(3~30자, 공백 불가) 충족 시 사용 가능 여부 */
export async function checkUsernameAvailability(username: string): Promise<boolean> {
  const u = username.trim()
  if (u.length < 3 || u.length > 30 || /\s/.test(u)) {
    return false
  }
  const r = await apiRequest<{ available: boolean }>(
    `/api/auth/username-availability?username=${encodeURIComponent(u)}`,
    { method: 'GET' },
  )
  return Boolean(r.available)
}

/** 회원가입 GA 코드 자동 조회 — GET /api/ga/validate */
export type ValidateGaSignupResponse = { success: boolean; gaName?: string }

export async function validateGaCodeForSignup(code: string): Promise<ValidateGaSignupResponse> {
  const c = code.trim()
  if (!c) {
    return { success: false }
  }
  const url = resolveApiUrl(`/api/ga/validate?code=${encodeURIComponent(c)}`)
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      return { success: false }
    }
    const body = (await res.json()) as ValidateGaSignupResponse
    return body
  } catch {
    return { success: false }
  }
}

export async function fetchSignedInviteSignupUrl(token: string): Promise<{ path: string }> {
  return apiRequest<{ path: string }>('/api/auth/invite-signup-url', { method: 'GET', token })
}

export async function register(payload: {
  username: string
  password: string
  /** GA 코드(insurance 기본) */
  inviteCode?: string
  /** 테넌트 가입 코드 경로 */
  industryCode?: string
  registrationCode?: string
  /** 초대 담당자(users.id) — 있을 때만 서버에서 GA 일치 검증 */
  refUserId?: string
  /** 서버 HMAC — 초대 링크 경유 시에만 사용 */
  inviteSig?: string
  /** 링크 발행 시각(ms) — 초대 링크 경유 시에만 사용 */
  inviteTs?: string | number
  name: string
  /** 완화 모드에서는 생략 가능 */
  phoneNumber?: string
  signupPhoneProof?: string
}) {
  try {
    const body: Record<string, string> = {
      username: payload.username.trim(),
      password: payload.password,
      name: payload.name.trim(),
    }
    const ind = payload.industryCode?.trim().toLowerCase()
    const reg = payload.registrationCode?.trim().toUpperCase().replace(/\s+/g, '')
    if (ind && reg) {
      body.industry_code = ind
      body.registration_code = reg
    } else if (payload.inviteCode?.trim()) {
      body.invite_code = payload.inviteCode.trim()
    } else {
      throw new Error('GA 코드 또는 업종 가입 코드가 필요합니다.')
    }
    const refUserId = payload.refUserId?.trim()
    const inviteSig = payload.inviteSig?.trim()
    const inviteTs = payload.inviteTs != null ? String(payload.inviteTs).trim() : ''
    if (refUserId) {
      body.ref_user_id = refUserId
    }
    if (inviteSig) {
      body.invite_sig = inviteSig
    }
    if (inviteTs) {
      body.invite_ts = inviteTs
    }
    body.phone_number = String(payload.phoneNumber ?? '').trim()
    const proof = payload.signupPhoneProof?.trim()
    if (proof) {
      body.signup_phone_proof = proof
    }
    return await apiRequest<{ id: string; username: string; ga_id: number; createdAt: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error(error.message || '이미 사용 중인 아이디입니다.')
    }
    throw error
  }
}

export async function sendSignupPhoneCode(
  payload:
    | { inviteCode: string; phoneNumber: string }
    | { industryCode: string; registrationCode: string; phoneNumber: string },
) {
  const body: Record<string, string> = { phone_number: payload.phoneNumber }
  if ('inviteCode' in payload) {
    body.invite_code = payload.inviteCode.trim()
  } else {
    body.industry_code = payload.industryCode.trim().toLowerCase()
    body.registration_code = payload.registrationCode.trim().toUpperCase().replace(/\s+/g, '')
  }
  return apiRequest<{ ok?: boolean; message?: string; debugCode?: string }>(
    '/api/auth/send-signup-phone-code',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
}

export async function verifySignupPhoneCode(
  payload:
    | { inviteCode: string; phoneNumber: string; code: string }
    | { industryCode: string; registrationCode: string; phoneNumber: string; code: string },
) {
  const body: Record<string, string> = {
    phone_number: payload.phoneNumber,
    code: payload.code.trim(),
  }
  if ('inviteCode' in payload) {
    body.invite_code = payload.inviteCode.trim()
  } else {
    body.industry_code = payload.industryCode.trim().toLowerCase()
    body.registration_code = payload.registrationCode.trim().toUpperCase().replace(/\s+/g, '')
  }
  return apiRequest<{
    ok?: boolean
    success?: boolean
    message?: string
    signup_phone_proof?: string
    data?: {
      ok?: boolean
      success?: boolean
      message?: string
      signup_phone_proof?: string
    }
  }>('/api/auth/verify-signup-phone-code', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function validateTenantRegistrationCodeForSignup(payload: {
  industryCode: string
  registrationCode: string
}): Promise<{ ok: boolean; message?: string; tenantName?: string }> {
  try {
    const res = await fetch(resolveApiUrl('/api/auth/validate-tenant-registration-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industry_code: payload.industryCode.trim().toLowerCase(),
        registration_code: payload.registrationCode.trim().toUpperCase().replace(/\s+/g, ''),
      }),
    })
    const data = (await res.json()) as { ok?: boolean; message?: string; tenantName?: string }
    if (!res.ok) {
      return { ok: false, message: data.message ?? '가입 코드를 확인할 수 없습니다.' }
    }
    return { ok: Boolean(data.ok), tenantName: data.tenantName, message: data.message }
  } catch {
    return { ok: false, message: '네트워크 오류로 코드를 확인하지 못했습니다.' }
  }
}

export interface MeResponse {
  id: string
  username: string
  display_name: string
  phone_number: string
  role: string
  ga_id: number | null
  status: string
  team_id: string | null
  subscription?: SubscriptionResponsePayload | null
}

export async function fetchMe(token: string): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/me', { method: 'GET', token })
}

export async function patchMe(
  token: string,
  body: {
    display_name?: string
    phone_number?: string
    phone_change_proof?: string
  },
): Promise<MeResponse> {
  return apiRequest<MeResponse>('/api/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
}

export async function sendPhoneChangeCode(token: string, phoneNumber: string) {
  return apiRequest<{ ok?: boolean; message?: string; debugCode?: string }>(
    '/api/me/send-phone-change-code',
    {
      method: 'POST',
      token,
      body: JSON.stringify({ phone_number: phoneNumber }),
    },
  )
}

export async function verifyPhoneChangeCode(token: string, phoneNumber: string, code: string) {
  return apiRequest<{ ok?: boolean; message?: string; phone_change_proof: string }>(
    '/api/me/verify-phone-change-code',
    {
      method: 'POST',
      token,
      body: JSON.stringify({ phone_number: phoneNumber, code: code.trim() }),
    },
  )
}

function parseLoginTenantCrm(raw: unknown): TenantCrmConfig | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as TenantCrmConfig
}

export async function login(username: string, password: string) {
  const raw = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
  })
  const gaCode =
    typeof raw.user.ga_code === 'string' ? raw.user.ga_code.trim().toUpperCase() : ''
  const gaName = typeof raw.user.ga_name === 'string' ? raw.user.ga_name.trim() : ''
  const gaId =
    typeof raw.user.ga_id === 'number' && Number.isInteger(raw.user.ga_id) && raw.user.ga_id > 0
      ? raw.user.ga_id
      : 0
  const rawCid = raw.user.company_id
  const companyId =
    typeof rawCid === 'number' && Number.isInteger(rawCid) && rawCid > 0 ? rawCid : null
  const displayName =
    typeof raw.user.display_name === 'string'
      ? raw.user.display_name.trim()
      : String(raw.user.username ?? '').trim()
  const rawTeam = raw.user.team_id
  const teamId =
    typeof rawTeam === 'string' && rawTeam.trim() ? rawTeam.trim() : null
  const subscription = normalizeSubscriptionFromApi(raw.user.subscription)

  const crmIc = raw.user.crm_industry_code
  const crmIndustryCode =
    crmIc == null ? null : typeof crmIc === 'string' && crmIc.trim() ? crmIc.trim() : String(crmIc).trim()
  const tenantCrm = parseLoginTenantCrm(raw.user.tenant_crm)

  return {
    token: raw.token,
    user: {
      id: raw.user.id,
      username: raw.user.username,
      role: raw.user.role,
      gaId,
      gaCode,
      gaName,
      companyId: raw.user.role === 'INSURER_MANAGER' ? companyId : null,
      displayName,
      teamId,
      subscription,
      crmIndustryCode: crmIndustryCode || null,
      tenantCrm,
      ...(raw.user.crm_dynamic_industry_template != null
        ? { crmDynamicIndustryTemplate: raw.user.crm_dynamic_industry_template }
        : {}),
    },
  } satisfies { token: string; user: AuthUser }
}

export type GaDelegateRole = 'GA_ADMIN' | 'GA_STAFF'

export interface CreateDelegateUserResponse {
  success: boolean
  data: {
    id: string
    username: string
    role: GaDelegateRole
    ga_id: number
    displayName: string
  }
}

export async function createDelegateUser(
  token: string,
  payload: { username: string; password: string; name?: string; gaId: number; role: GaDelegateRole },
) {
  try {
    return await apiRequest<CreateDelegateUserResponse>('/api/admin/user', {
      method: 'POST',
      token,
      body: JSON.stringify({
        username: payload.username,
        password: payload.password,
        name: payload.name ?? '',
        ga_id: payload.gaId,
        role: payload.role,
      }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('이미 사용 중인 아이디입니다.')
    }
    throw error
  }
}

/** @deprecated 하위 호환 — createDelegateUser({ role: 'GA_ADMIN' }) 사용 권장 */
export async function createStaffAccount(
  token: string,
  payload: { username: string; password: string; name?: string; gaId: number },
) {
  return createDelegateUser(token, { ...payload, role: 'GA_ADMIN' })
}

export interface AdminUserRow {
  id: string
  ga_id: number
  /** 표시 이름 (없으면 빈 문자열) */
  display_name: string
  ga_company_name: string
  username: string
  role: UserRole
  status: EntityStatus
  created_at: string
}

/** 슈퍼 관리자 — GA 담당자(GA_ADMIN/GA_STAFF) 전용. 비밀번호는 관리 목적 평문(일반 유저와 무관). */
export interface GaDelegateRow {
  id: string
  ga_id: number
  gaCode: string
  gaName: string
  username: string
  password: string
  role: GaDelegateRole
  status: EntityStatus
  /** ACTIVE | BLOCKED | INACTIVE 표기 */
  statusLabel: string
  created_at: string
}

export async function listGaDelegates(token: string): Promise<GaDelegateRow[]> {
  return apiRequest<GaDelegateRow[]>('/api/admin/delegates', { method: 'GET', token })
}

export async function createGaDelegate(
  token: string,
  payload: { gaId: number; username: string; password: string; name?: string; role: GaDelegateRole },
) {
  try {
    return await apiRequest<GaDelegateRow>('/api/admin/delegates', {
      method: 'POST',
      token,
      body: JSON.stringify({
        ga_id: payload.gaId,
        username: payload.username,
        password: payload.password,
        name: payload.name ?? '',
        role: payload.role,
      }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('이미 사용 중인 아이디입니다.')
    }
    throw error
  }
}

export async function patchGaDelegate(
  token: string,
  id: string,
  body: { username?: string; password?: string; status?: EntityStatus },
) {
  try {
    const payload: Record<string, unknown> = {}
    if (body.username != null) {
      payload.username = body.username
    }
    if (body.password != null && body.password.trim() !== '') {
      payload.password = body.password
    }
    if (body.status != null) {
      payload.status = body.status
    }
    return await apiRequest<GaDelegateRow>(`/api/admin/delegates/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('이미 사용 중인 아이디입니다.')
    }
    throw error
  }
}

export async function listAdminUsers(token: string, gaId?: number): Promise<AdminUserRow[]> {
  const qs = gaId != null && Number.isInteger(gaId) ? `?ga_id=${encodeURIComponent(String(gaId))}` : ''
  return apiRequest<AdminUserRow[]>(`/api/admin/users${qs}`, { method: 'GET', token })
}

export async function patchAdminUser(
  token: string,
  userId: string,
  body: { ga_id?: number; role?: string; status?: EntityStatus },
) {
  const payload: Record<string, unknown> = {}
  if (body.ga_id != null) {
    payload.ga_id = body.ga_id
  }
  if (body.role != null) {
    payload.role = body.role
  }
  if (body.status != null) {
    payload.status = body.status
  }
  return apiRequest<AdminUserRow>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export async function deleteAdminUser(token: string, userId: string): Promise<void> {
  await apiRequest<unknown>(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    token,
  })
}

export async function createGaCompany(token: string, payload: { name: string; code: string }) {
  try {
    return await apiRequest<GaCompanyRow>('/api/admin/ga', {
      method: 'POST',
      token,
      body: JSON.stringify({ name: payload.name.trim(), code: payload.code.trim().toUpperCase() }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('이미 존재하는 코드입니다')
    }
    throw error
  }
}

export async function patchGaCompany(
  token: string,
  id: number,
  body: { name?: string; code?: string; status?: EntityStatus },
) {
  try {
    return await apiRequest<GaCompanyRow>(`/api/admin/ga/${id}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error('이미 존재하는 코드입니다')
    }
    throw error
  }
}

export async function listGaCompanyHistory(token: string, id: number): Promise<GaHistoryRow[]> {
  return apiRequest<GaHistoryRow[]>(`/api/admin/ga/${id}/history`, {
    method: 'GET',
    token,
  })
}

export async function deleteGaCompany(token: string, id: number): Promise<void> {
  await apiRequest<unknown>(`/api/admin/ga/${id}`, {
    method: 'DELETE',
    token,
  })
}

export type FeatureRequestStatus = 'pending' | 'reviewed' | 'done'

export interface FeatureRequestAdminRow {
  id: number
  ga_id: number
  ga_name: string
  username: string
  title: string
  content: string
  status: FeatureRequestStatus
  created_at: string
  comment_count: number
}

// 문의/요청 댓글.
// - authorRole 은 서버가 넣어주는 값("admin" 또는 향후 "user").
//   UI 는 'admin' 과 그 외를 분기하므로 유니언으로 고정하지 않고 문자열로 둔다.
// - authorUsername 은 계정이 삭제되었을 경우 null 일 수 있다.
export interface FeatureRequestComment {
  id: number
  authorRole: string
  authorUsername: string | null
  authorId: string
  createdAt: string
  content: string
}

export async function submitFeatureRequest(
  token: string,
  payload: { content: string; title?: string },
) {
  const title = String(payload.title ?? '').trim()
  const content = String(payload.content ?? '').trim()
  return apiRequest<{ id: number; created_at: string }>('/api/feature-request', {
    method: 'POST',
    token,
    body: JSON.stringify({
      content,
      ...(title ? { title } : {}),
    }),
  })
}

export interface MyFeatureRequestRow {
  id: number
  title: string
  content: string
  status: FeatureRequestStatus
  created_at: string
  comment_count: number
}

export async function listMyFeatureRequests(token: string): Promise<MyFeatureRequestRow[]> {
  return apiRequest<MyFeatureRequestRow[]>('/api/feature-requests/my', { method: 'GET', token })
}

export async function deleteMyFeatureRequest(token: string, id: number): Promise<void> {
  await apiRequest<undefined>(`/api/feature-requests/my/${id}`, { method: 'DELETE', token })
}

// 요청자 본인이 자신의 요청에 달린 댓글을 지연 로딩한다.
// 목록 API 의 comment_count 는 존재만 알려주고, 실제 본문은 사용자가 펼칠 때만 가져온다.
export async function listMyFeatureRequestComments(
  token: string,
  id: number,
): Promise<FeatureRequestComment[]> {
  return apiRequest<FeatureRequestComment[]>(`/api/feature-requests/my/${id}/comments`, {
    method: 'GET',
    token,
  })
}

export async function listFeatureRequestsAdmin(token: string): Promise<FeatureRequestAdminRow[]> {
  return apiRequest<FeatureRequestAdminRow[]>('/api/admin/feature-requests', { method: 'GET', token })
}

// 관리자 전용: 특정 요청에 달린 모든 댓글.
export async function listAdminFeatureRequestComments(
  token: string,
  id: number,
): Promise<FeatureRequestComment[]> {
  return apiRequest<FeatureRequestComment[]>(`/api/admin/feature-requests/${id}/comments`, {
    method: 'GET',
    token,
  })
}

// 관리자 전용: 새 답변 등록. 서버가 author_role='admin' 과 작성자 정보를 기록한다.
export async function createAdminFeatureRequestComment(
  token: string,
  id: number,
  content: string,
): Promise<FeatureRequestComment> {
  return apiRequest<FeatureRequestComment>(`/api/admin/feature-requests/${id}/comments`, {
    method: 'POST',
    token,
    body: JSON.stringify({ content }),
  })
}

export async function updateFeatureRequestStatus(
  token: string,
  id: number,
  status: FeatureRequestStatus,
) {
  return apiRequest<{
    id: number
    ga_id: number
    user_id: string
    title: string
    content: string
    status: FeatureRequestStatus
    created_at: string
  }>(`/api/admin/feature-requests/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status }),
  })
}
