/**
 * 구독 관리 관리자 API 클라이언트 (SSOT)
 *
 * - 백엔드: `server/subscription/adminUserEndpoints.js` + `server/registerSubscriptionAdminApi.js`
 * - 이 파일만 갱신하면 모든 관리자 UI 가 같은 API 계약을 공유한다.
 *
 * 엔드포인트 구성
 *  1) 정책 스위치           : GET/POST /admin/subscription/policy|activate|deactivate
 *  2) 전역 설정(trial 일수) : GET/PATCH /admin/settings/subscription
 *  3) 유저 목록/단건/일괄   : GET/PATCH/POST /admin/subscriptions/users(...)
 */

import { apiRequest } from '../../../lib/apiClient'
import type {
  EffectiveSubscriptionStatus,
  SubscriptionPlan,
  SubscriptionReason,
} from '../../subscription/policy'

// -------------------------------------------------------------
// 정책 상태
// -------------------------------------------------------------

/**
 * 서버 `getSubscriptionPolicyStatus()` 응답 shape (camelCase).
 * - eligibleUserCount: 활성화 시 FREE → TRIAL 로 전환될 유저 수
 * - trialUserCount   : 현재 TRIAL 상태 유저 수
 * - expiredUserCount : expires_at 이 경과한 유저 수
 */
export interface SubscriptionPolicyStatus {
  policyActive: boolean
  trialDefaultDays: number
  eligibleUserCount: number
  trialUserCount: number
  expiredUserCount: number
}

export interface SubscriptionPolicyStatusResponse {
  ok: boolean
  status: SubscriptionPolicyStatus
}

export async function fetchSubscriptionPolicyStatus(
  token: string,
): Promise<SubscriptionPolicyStatusResponse> {
  return apiRequest('/api/admin/subscription/policy', { token })
}

export interface ActivateSubscriptionPolicyBody {
  trialDays?: number
  dryRun?: boolean
  memo?: string
}

export interface ActivateSubscriptionPolicyResult {
  dryRun: boolean
  alreadyActive: boolean
  trialDays: number
  eligibleCount: number
  convertedCount: number
  policyActive: boolean
}

export async function activateSubscriptionPolicy(
  token: string,
  body: ActivateSubscriptionPolicyBody,
): Promise<{ ok: boolean; result: ActivateSubscriptionPolicyResult }> {
  return apiRequest('/api/admin/subscription/activate', {
    method: 'POST',
    token,
    body: JSON.stringify(body ?? {}),
  })
}

export async function deactivateSubscriptionPolicy(
  token: string,
): Promise<{ ok: boolean; result: { wasActive: boolean; policyActive: boolean } }> {
  return apiRequest('/api/admin/subscription/deactivate', {
    method: 'POST',
    token,
    body: '{}',
  })
}

// -------------------------------------------------------------
// 전역 설정 (TRIAL 기본 일수)
// -------------------------------------------------------------

export interface SubscriptionGlobalSettings {
  ok: boolean
  policy_active: boolean
  trial_default_days: number
}

export async function fetchSubscriptionGlobalSettings(
  token: string,
): Promise<SubscriptionGlobalSettings> {
  return apiRequest('/api/admin/settings/subscription', { token })
}

export async function updateSubscriptionGlobalSettings(
  token: string,
  body: { trial_default_days: number },
): Promise<{ ok: boolean; trial_default_days: number }> {
  return apiRequest('/api/admin/settings/subscription', {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
}

// -------------------------------------------------------------
// 유저 목록 / 단건 / 일괄
// -------------------------------------------------------------

export interface SubscriptionUserListFilters {
  gaId?: number | null
  plan?: SubscriptionPlan | null
  status?: EffectiveSubscriptionStatus | null
  nearExpiry?: boolean
  nearDays?: number
  expiredOnly?: boolean
  keyword?: string
  page?: number
  pageSize?: number
}

export interface SubscriptionUserRow {
  id: string
  username: string
  display_name: string | null
  role: string
  status: string
  ga_id: number | null
  ga_name: string | null
  plan: SubscriptionPlan
  started_at: string | null
  expires_at: string | null
  effective_status: EffectiveSubscriptionStatus
  remaining_days: number | null
  reason: SubscriptionReason
}

export interface SubscriptionUserListResponse {
  ok: boolean
  policy_active: boolean
  page: number
  page_size: number
  total: number
  users: SubscriptionUserRow[]
}

function buildQuery(filters: SubscriptionUserListFilters): string {
  const q = new URLSearchParams()
  if (filters.gaId != null) q.set('ga_id', String(filters.gaId))
  if (filters.plan) q.set('plan', filters.plan)
  if (filters.status) q.set('status', filters.status)
  if (filters.nearExpiry) q.set('near_expiry', 'true')
  if (filters.nearDays) q.set('near_days', String(filters.nearDays))
  if (filters.expiredOnly) q.set('expired_only', 'true')
  if (filters.keyword?.trim()) q.set('keyword', filters.keyword.trim())
  if (filters.page) q.set('page', String(filters.page))
  if (filters.pageSize) q.set('page_size', String(filters.pageSize))
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function fetchSubscriptionUsers(
  token: string,
  filters: SubscriptionUserListFilters,
): Promise<SubscriptionUserListResponse> {
  return apiRequest(`/api/admin/subscriptions/users${buildQuery(filters)}`, { token })
}

export interface UpdateSubscriptionUserBody {
  plan?: SubscriptionPlan
  expires_at?: string | null
  started_at?: string | null
  memo?: string | null
}

export async function updateSubscriptionUser(
  token: string,
  userId: string,
  body: UpdateSubscriptionUserBody,
): Promise<{ ok: boolean }> {
  return apiRequest(`/api/admin/subscriptions/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
}

export type BulkSubscriptionAction =
  | { kind: 'SET_PLAN'; plan: SubscriptionPlan; expiresAt?: string | null; startedAt?: string | null }
  | { kind: 'EXTEND_DAYS'; days: number }
  | { kind: 'SET_EXPIRY'; expiresAt: string | null }

export async function bulkUpdateSubscriptionUsers(
  token: string,
  userIds: string[],
  action: BulkSubscriptionAction,
): Promise<{ ok: boolean; affected: number }> {
  return apiRequest('/api/admin/subscriptions/users/bulk', {
    method: 'POST',
    token,
    body: JSON.stringify({ user_ids: userIds, action }),
  })
}
