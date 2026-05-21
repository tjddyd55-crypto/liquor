/**
 * 구독 상태 기반 접근 제어 — 정책 SSOT (서버)
 *
 * 단일 진입점: evaluateSubscription({ role, plan, expiresAt, startedAt, policyActive, now })
 *
 * 설계 원칙:
 * 1) 순수 함수(I/O 없음). 테스트 용이 + 프론트 미러(src/features/subscription/policy.ts)와 동일 로직 유지.
 * 2) 정책 활성화 플래그(policyActive=false) 가 최우선 가드 — 플래그 OFF 인 동안은 전 유저 ACTIVE.
 *    이 덕에 데이터 모델·응답 확장만 먼저 배포하고, 정책 발효 시점은 관리자가 별도 토글로 결정한다.
 * 3) DB 의 plan 은 "의도한 상태"고, 실제 유효 상태는 여기서 매 요청마다 계산 → cron 불필요.
 *
 * 향후 확장 지점:
 * - GA 단위 정책(Plan 상속)을 붙이려면 input 에 `gaPolicy` 를 추가하고 plan 결정 로직만 확장.
 * - 유예 기간(grace period) 도입 시 SUBSCRIPTION_PLAN_KEYS 와 별개로 grace window 상수만 추가.
 */

/** @typedef {'FREE' | 'TRIAL' | 'PAID' | 'EXPIRED'} SubscriptionPlan */
/** @typedef {'ACTIVE' | 'EXPIRED'} EffectiveSubscriptionStatus */

/** @type {ReadonlyArray<SubscriptionPlan>} */
export const SUBSCRIPTION_PLAN_KEYS = Object.freeze(['FREE', 'TRIAL', 'PAID', 'EXPIRED'])

/**
 * 구독 정책 대상이 되는 역할 목록. SSOT — 서버 어디서든(정책 판정, 활성화 SQL, 관리자 쿼리)
 * 이 목록만 참조해야 주체 범위가 한 곳에서 관리된다.
 *
 * @type {ReadonlyArray<string>}
 */
export const SUBSCRIPTION_SUBJECT_ROLES = Object.freeze(['GA_ADMIN', 'GA_STAFF', 'USER'])

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * 구독 대상 역할인가. SUPER_ADMIN 은 정책 대상 아님(항상 통과).
 * INSURER_MANAGER / LOSS_ADJUSTER 는 이번 스코프 제외(별도 계정 체계).
 *
 * @param {string | null | undefined} role
 * @returns {boolean}
 */
export function isSubscriptionSubjectRole(role) {
  return typeof role === 'string' && SUBSCRIPTION_SUBJECT_ROLES.includes(role)
}

/**
 * SubscriptionPlan 정규화. 잘못된 값은 기본 'FREE' 로 복원.
 *
 * @param {unknown} value
 * @returns {SubscriptionPlan}
 */
export function normalizeSubscriptionPlan(value) {
  if (typeof value !== 'string') {
    return 'FREE'
  }
  const upper = value.trim().toUpperCase()
  if (SUBSCRIPTION_PLAN_KEYS.includes(/** @type {SubscriptionPlan} */ (upper))) {
    return /** @type {SubscriptionPlan} */ (upper)
  }
  return 'FREE'
}

/**
 * @param {Date | string | null | undefined} value
 * @returns {Date | null}
 */
function toDate(value) {
  if (value == null) {
    return null
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * @param {Date | null} expiresAt
 * @param {Date} now
 * @returns {number | null}
 */
function calcRemainingDays(expiresAt, now) {
  if (expiresAt == null) {
    return null
  }
  const diffMs = expiresAt.getTime() - now.getTime()
  if (diffMs <= 0) {
    return 0
  }
  return Math.ceil(diffMs / MS_PER_DAY)
}

/**
 * @typedef {Object} EvaluateSubscriptionInput
 * @property {string | null | undefined} role
 * @property {SubscriptionPlan | string | null | undefined} plan
 * @property {Date | string | null | undefined} expiresAt
 * @property {Date | string | null | undefined} startedAt
 * @property {boolean} policyActive
 * @property {Date} [now]
 */

/**
 * @typedef {Object} EvaluateSubscriptionOutput
 * @property {EffectiveSubscriptionStatus} effectiveStatus
 * @property {SubscriptionPlan} plan
 * @property {Date | null} expiresAt
 * @property {Date | null} startedAt
 * @property {number | null} remainingDays
 * @property {'policy-inactive'|'not-subject'|'free'|'trial-active'|'paid-active'|'trial-expired'|'paid-expired'|'forced-expired'} reason
 */

/**
 * @param {EvaluateSubscriptionInput} input
 * @returns {EvaluateSubscriptionOutput}
 */
export function evaluateSubscription(input) {
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
