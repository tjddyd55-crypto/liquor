/**
 * 구독 상태 기반 접근 제어 — 정책 SSOT (프론트 미러)
 *
 * 서버(`server/subscription/policy.js`)와 동일 로직을 TS 로 재작성한다. 같은 입력이면 같은 출력을 낸다.
 * - 프론트에서 서버 응답과 별개로 상태 텍스트 표시·라우트 가드·메뉴 필터에 쓰기 위해 필요.
 * - 향후 서버·프론트 동기화 보증은 `policy.test.ts` 의 테이블-드리븐 테스트로 지킨다(PR6).
 *
 * 호출 기본 원칙:
 * - 서버 응답(`user.subscription`) 을 신뢰한다. 이 함수는 보조 계산(예: 남은 일수 재계산, 만료 초과 직후 UI 갱신)용.
 */

export type SubscriptionPlan = 'FREE' | 'TRIAL' | 'PAID' | 'EXPIRED'
export type EffectiveSubscriptionStatus = 'ACTIVE' | 'EXPIRED'

export type SubscriptionReason =
  | 'policy-inactive'
  | 'not-subject'
  | 'free'
  | 'trial-active'
  | 'paid-active'
  | 'trial-expired'
  | 'paid-expired'
  | 'forced-expired'

export const SUBSCRIPTION_PLAN_KEYS: readonly SubscriptionPlan[] = Object.freeze([
  'FREE',
  'TRIAL',
  'PAID',
  'EXPIRED',
])

const SUBSCRIPTION_SUBJECT_ROLES: readonly string[] = Object.freeze([
  'GA_ADMIN',
  'GA_STAFF',
  'USER',
])

const MS_PER_DAY = 1000 * 60 * 60 * 24

export function isSubscriptionSubjectRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && SUBSCRIPTION_SUBJECT_ROLES.includes(role)
}

export function normalizeSubscriptionPlan(value: unknown): SubscriptionPlan {
  if (typeof value !== 'string') {
    return 'FREE'
  }
  const upper = value.trim().toUpperCase() as SubscriptionPlan
  if (SUBSCRIPTION_PLAN_KEYS.includes(upper)) {
    return upper
  }
  return 'FREE'
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value == null) {
    return null
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function calcRemainingDays(expiresAt: Date | null, now: Date): number | null {
  if (expiresAt == null) {
    return null
  }
  const diffMs = expiresAt.getTime() - now.getTime()
  if (diffMs <= 0) {
    return 0
  }
  return Math.ceil(diffMs / MS_PER_DAY)
}

export interface EvaluateSubscriptionInput {
  role: string | null | undefined
  plan: SubscriptionPlan | string | null | undefined
  expiresAt: Date | string | null | undefined
  startedAt: Date | string | null | undefined
  policyActive: boolean
  now?: Date
}

export interface EvaluateSubscriptionOutput {
  effectiveStatus: EffectiveSubscriptionStatus
  plan: SubscriptionPlan
  expiresAt: Date | null
  startedAt: Date | null
  remainingDays: number | null
  reason: SubscriptionReason
}

export function evaluateSubscription(input: EvaluateSubscriptionInput): EvaluateSubscriptionOutput {
  const now = input.now instanceof Date ? input.now : new Date()
  const plan = normalizeSubscriptionPlan(input.plan)
  const startedAt = toDate(input.startedAt ?? null)
  const expiresAt = toDate(input.expiresAt ?? null)

  if (input.policyActive !== true) {
    return {
      effectiveStatus: 'ACTIVE',
      plan: 'FREE',
      expiresAt: null,
      startedAt: null,
      remainingDays: null,
      reason: 'policy-inactive',
    }
  }

  if (!isSubscriptionSubjectRole(input.role ?? null)) {
    return {
      effectiveStatus: 'ACTIVE',
      plan: 'FREE',
      expiresAt: null,
      startedAt: null,
      remainingDays: null,
      reason: 'not-subject',
    }
  }

  if (plan === 'FREE') {
    return {
      effectiveStatus: 'ACTIVE',
      plan: 'FREE',
      expiresAt: null,
      startedAt,
      remainingDays: null,
      reason: 'free',
    }
  }

  if (plan === 'EXPIRED') {
    return {
      effectiveStatus: 'EXPIRED',
      plan: 'EXPIRED',
      expiresAt,
      startedAt,
      remainingDays: 0,
      reason: 'forced-expired',
    }
  }

  const hasExpiry = expiresAt != null
  const isActive = hasExpiry && expiresAt.getTime() > now.getTime()

  if (plan === 'TRIAL') {
    return {
      effectiveStatus: isActive ? 'ACTIVE' : 'EXPIRED',
      plan: isActive ? 'TRIAL' : 'EXPIRED',
      expiresAt,
      startedAt,
      remainingDays: calcRemainingDays(expiresAt, now),
      reason: isActive ? 'trial-active' : 'trial-expired',
    }
  }

  return {
    effectiveStatus: isActive ? 'ACTIVE' : 'EXPIRED',
    plan: isActive ? 'PAID' : 'EXPIRED',
    expiresAt,
    startedAt,
    remainingDays: calcRemainingDays(expiresAt, now),
    reason: isActive ? 'paid-active' : 'paid-expired',
  }
}

/**
 * 서버가 내려준 snake_case subscription payload(camelCase 변환 전)를 프론트 내부 포맷으로 정규화.
 * authApi.ts 의 login 매핑, AuthProvider 의 session 복원에서 공용으로 사용한다.
 */
export interface SubscriptionSnapshot {
  plan: SubscriptionPlan
  effectiveStatus: EffectiveSubscriptionStatus
  startedAt: string | null
  expiresAt: string | null
  remainingDays: number | null
  reason: SubscriptionReason
  policyActive: boolean
}

export function normalizeSubscriptionFromApi(raw: unknown): SubscriptionSnapshot | null {
  if (raw == null || typeof raw !== 'object') {
    return null
  }
  const r = raw as Record<string, unknown>
  const plan = normalizeSubscriptionPlan(r.plan)
  const effectiveStatus: EffectiveSubscriptionStatus =
    r.effective_status === 'EXPIRED' ? 'EXPIRED' : 'ACTIVE'
  const startedAt = typeof r.started_at === 'string' && r.started_at.trim() ? r.started_at : null
  const expiresAt = typeof r.expires_at === 'string' && r.expires_at.trim() ? r.expires_at : null
  const remainingDaysRaw = r.remaining_days
  const remainingDays =
    typeof remainingDaysRaw === 'number' && Number.isFinite(remainingDaysRaw)
      ? remainingDaysRaw
      : null
  const reason = normalizeReason(r.reason)
  const policyActive = r.policy_active === true
  return { plan, effectiveStatus, startedAt, expiresAt, remainingDays, reason, policyActive }
}

const REASON_KEYS: readonly SubscriptionReason[] = Object.freeze([
  'policy-inactive',
  'not-subject',
  'free',
  'trial-active',
  'paid-active',
  'trial-expired',
  'paid-expired',
  'forced-expired',
])

function normalizeReason(value: unknown): SubscriptionReason {
  if (typeof value !== 'string') {
    return 'policy-inactive'
  }
  const v = value as SubscriptionReason
  if (REASON_KEYS.includes(v)) {
    return v
  }
  return 'policy-inactive'
}
