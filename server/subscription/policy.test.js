/**
 * 구독 정책 SSOT — 테이블-드리븐 단위 테스트
 *
 * - 목적: `evaluateSubscription` 의 8가지 reason 조합과 경계값을 한 눈에 보이게 고정.
 *   추후 로직을 손볼 때 이 테이블만 봐도 "어떤 케이스가 무엇을 반환해야 하는지" 가 계약으로 남는다.
 * - Node 20+ 의 `node:test` 내장 러너 사용 (추가 devDependency 없이 실행).
 *   실행: `node --test server/subscription/policy.test.js`
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluateSubscription, normalizeSubscriptionPlan } from './policy.js'

const NOW = new Date('2026-04-22T12:00:00Z')
const IN_5_DAYS = new Date('2026-04-27T12:00:00Z')
const YESTERDAY = new Date('2026-04-21T12:00:00Z')

function evalAt(overrides) {
  return evaluateSubscription({
    role: 'USER',
    plan: 'FREE',
    startedAt: null,
    expiresAt: null,
    policyActive: true,
    now: NOW,
    ...overrides,
  })
}

test('정책 비활성이면 입력 무관 모두 FREE/ACTIVE (policy-inactive)', () => {
  const out = evalAt({ policyActive: false, plan: 'EXPIRED', expiresAt: YESTERDAY })
  assert.equal(out.effectiveStatus, 'ACTIVE')
  assert.equal(out.plan, 'FREE')
  assert.equal(out.reason, 'policy-inactive')
  assert.equal(out.remainingDays, null)
})

test('구독 주체 역할이 아니면 통과 (not-subject) — SUPER_ADMIN 은 정책 대상 아님', () => {
  const out = evalAt({ role: 'SUPER_ADMIN', plan: 'TRIAL', expiresAt: YESTERDAY })
  assert.equal(out.effectiveStatus, 'ACTIVE')
  assert.equal(out.plan, 'FREE')
  assert.equal(out.reason, 'not-subject')
})

test('FREE 는 항상 ACTIVE — 기간 필드는 모두 null', () => {
  const out = evalAt({ plan: 'FREE' })
  assert.equal(out.effectiveStatus, 'ACTIVE')
  assert.equal(out.plan, 'FREE')
  assert.equal(out.expiresAt, null)
  assert.equal(out.remainingDays, null)
  assert.equal(out.reason, 'free')
})

test('TRIAL + 미래 만료일 → ACTIVE, remainingDays 양수', () => {
  const out = evalAt({ plan: 'TRIAL', expiresAt: IN_5_DAYS })
  assert.equal(out.effectiveStatus, 'ACTIVE')
  assert.equal(out.plan, 'TRIAL')
  assert.equal(out.reason, 'trial-active')
  assert.equal(out.remainingDays, 5)
})

test('TRIAL + 과거 만료일 → EXPIRED, plan 도 EXPIRED 로 승격', () => {
  const out = evalAt({ plan: 'TRIAL', expiresAt: YESTERDAY })
  assert.equal(out.effectiveStatus, 'EXPIRED')
  assert.equal(out.plan, 'EXPIRED')
  assert.equal(out.reason, 'trial-expired')
  assert.equal(out.remainingDays, 0)
})

test('PAID + 미래 만료일 → ACTIVE', () => {
  const out = evalAt({ plan: 'PAID', expiresAt: IN_5_DAYS })
  assert.equal(out.effectiveStatus, 'ACTIVE')
  assert.equal(out.plan, 'PAID')
  assert.equal(out.reason, 'paid-active')
  assert.equal(out.remainingDays, 5)
})

test('PAID + 과거 만료일 → EXPIRED 로 강등', () => {
  const out = evalAt({ plan: 'PAID', expiresAt: YESTERDAY })
  assert.equal(out.effectiveStatus, 'EXPIRED')
  assert.equal(out.plan, 'EXPIRED')
  assert.equal(out.reason, 'paid-expired')
})

test('EXPIRED 는 만료일 무관 forced-expired', () => {
  const out = evalAt({ plan: 'EXPIRED', expiresAt: IN_5_DAYS })
  assert.equal(out.effectiveStatus, 'EXPIRED')
  assert.equal(out.plan, 'EXPIRED')
  assert.equal(out.reason, 'forced-expired')
  assert.equal(out.remainingDays, 0)
})

test('TRIAL 만료 경계 — now 와 같은 expiresAt 은 만료로 취급 (isActive=false)', () => {
  const out = evalAt({ plan: 'TRIAL', expiresAt: NOW })
  assert.equal(out.effectiveStatus, 'EXPIRED')
  assert.equal(out.reason, 'trial-expired')
})

test('TRIAL + expiresAt null → EXPIRED (데이터 결손 방어)', () => {
  const out = evalAt({ plan: 'TRIAL', expiresAt: null })
  assert.equal(out.effectiveStatus, 'EXPIRED')
  assert.equal(out.reason, 'trial-expired')
})

test('normalizeSubscriptionPlan: 알 수 없는 값/비문자열 → FREE', () => {
  assert.equal(normalizeSubscriptionPlan('trial'), 'TRIAL')
  assert.equal(normalizeSubscriptionPlan('  paid '), 'PAID')
  assert.equal(normalizeSubscriptionPlan('UNKNOWN'), 'FREE')
  assert.equal(normalizeSubscriptionPlan(null), 'FREE')
  assert.equal(normalizeSubscriptionPlan(undefined), 'FREE')
  assert.equal(normalizeSubscriptionPlan(42), 'FREE')
})

test('잘못된 plan 문자열은 FREE 로 정규화되어 free 경로를 탄다', () => {
  const out = evalAt({ plan: 'SILVER', expiresAt: IN_5_DAYS })
  assert.equal(out.plan, 'FREE')
  assert.equal(out.reason, 'free')
})
