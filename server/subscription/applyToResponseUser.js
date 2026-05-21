/**
 * 응답 병합 헬퍼 — 유저 row + app_settings → snake_case `subscription` 객체
 *
 * 호출 위치:
 * - /api/auth/login 정상 경로(GA USER · GA_STAFF · GA_ADMIN · SUPER_ADMIN)
 * - /api/auth/login 매니저 경로(INSURER_MANAGER · LOSS_ADJUSTER) — `reason:'not-subject'` 로 내려감
 * - /api/me (요청별 단일 user row 기준)
 *
 * 반환 필드는 프론트 AuthUser.subscription 과 1:1 매핑된다(snake_case → camelCase 변환은 authApi.ts 에서).
 */

import { evaluateSubscription } from './policy.js'
import { readPolicyActive } from './appSettings.js'

/**
 * @typedef {Object} SubscriptionResponsePayload
 * @property {'FREE'|'TRIAL'|'PAID'|'EXPIRED'} plan
 * @property {'ACTIVE'|'EXPIRED'} effective_status
 * @property {string | null} started_at  - ISO-8601 UTC 또는 null
 * @property {string | null} expires_at
 * @property {number | null} remaining_days
 * @property {string} reason
 * @property {boolean} policy_active
 */

/**
 * 유저 row + 정책 활성화 플래그 → 응답 객체.
 *
 * @param {{ role?: string | null; subscription_plan?: string | null;
 *           subscription_started_at?: Date | string | null;
 *           subscription_expires_at?: Date | string | null }} userRow
 * @param {{ policyActive: boolean }} options
 * @returns {SubscriptionResponsePayload}
 */
export function buildSubscriptionResponse(userRow, options) {
  const policyActive = options.policyActive === true
  const evaluated = evaluateSubscription({
    role: userRow.role ?? null,
    plan: userRow.subscription_plan ?? null,
    startedAt: userRow.subscription_started_at ?? null,
    expiresAt: userRow.subscription_expires_at ?? null,
    policyActive,
  })
  return {
    plan: evaluated.plan,
    effective_status: evaluated.effectiveStatus,
    started_at: evaluated.startedAt ? evaluated.startedAt.toISOString() : null,
    expires_at: evaluated.expiresAt ? evaluated.expiresAt.toISOString() : null,
    remaining_days: evaluated.remainingDays,
    reason: evaluated.reason,
    policy_active: policyActive,
  }
}

/**
 * 단일 유저 응답 조립 시 DB 조회 한 번으로 policy_active 를 가져와 병합.
 * @param {{ role?: string | null; subscription_plan?: string | null;
 *           subscription_started_at?: Date | string | null;
 *           subscription_expires_at?: Date | string | null }} userRow
 * @returns {Promise<SubscriptionResponsePayload>}
 */
export async function buildSubscriptionResponseForUser(userRow) {
  const policyActive = await readPolicyActive()
  return buildSubscriptionResponse(userRow, { policyActive })
}
