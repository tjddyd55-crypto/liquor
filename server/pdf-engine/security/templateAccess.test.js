/**
 * 템플릿 접근 권한 게이트 테스트.
 *
 * 목적: 구독/역할 체계가 개편돼도 "어떤 케이스가 허용/거부되는지" 가 계약으로 고정되도록.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { canAccessTemplateForUser } from './templateAccess.js'

const isSuperAdminRole = (role) => role === 'SUPER_ADMIN'

const TEMPLATE_PUBLIC = { ga_id: null }
const TEMPLATE_GA_1 = { ga_id: 1 }
const TEMPLATE_GA_2 = { ga_id: 2 }

test('template 이 null 이면 항상 거부', () => {
  assert.equal(canAccessTemplateForUser(null, { role: 'SUPER_ADMIN' }, isSuperAdminRole), false)
})

test('SUPER_ADMIN 은 모든 GA·공용 템플릿에 접근 가능', () => {
  const user = { role: 'SUPER_ADMIN', gaId: null }
  for (const tpl of [TEMPLATE_PUBLIC, TEMPLATE_GA_1, TEMPLATE_GA_2]) {
    assert.equal(canAccessTemplateForUser(tpl, user, isSuperAdminRole), true)
  }
})

test('일반 USER 는 공용(null) 템플릿 접근 가능', () => {
  const user = { role: 'USER', gaId: 9 }
  assert.equal(canAccessTemplateForUser(TEMPLATE_PUBLIC, user, isSuperAdminRole), true)
})

test('일반 USER 는 본인 GA 템플릿만 접근 가능', () => {
  const user = { role: 'USER', gaId: 1 }
  assert.equal(canAccessTemplateForUser(TEMPLATE_GA_1, user, isSuperAdminRole), true)
  assert.equal(canAccessTemplateForUser(TEMPLATE_GA_2, user, isSuperAdminRole), false)
})

test('GA_ADMIN 이어도 다른 GA 템플릿은 거부', () => {
  const user = { role: 'GA_ADMIN', gaId: 1 }
  assert.equal(canAccessTemplateForUser(TEMPLATE_GA_2, user, isSuperAdminRole), false)
})

test('user 가 null 이면 공용도 허용 (인증 단계에서 거부되어야 하지만, 함수 자체는 role 미지 = 비관리자)', () => {
  /* 운영상 requireAuth 를 통과한 호출만 이 함수에 도달하므로, null user 는 실제로는 발생 X.
     그러나 타입 방어를 위해 회귀 테스트로 고정: 공용 템플릿은 true, GA 제한 템플릿은 false. */
  assert.equal(canAccessTemplateForUser(TEMPLATE_PUBLIC, null, isSuperAdminRole), true)
  assert.equal(canAccessTemplateForUser(TEMPLATE_GA_1, null, isSuperAdminRole), false)
})
