/**
 * customers.crm_extension JSONB — 요청 정규화·DB 직렬화 단위 테스트.
 * Government / Gym 업종 확장 필드가 같은 규약으로 저장되도록 고정한다.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  parseCrmExtensionFromDb,
  sanitizeCrmExtensionFieldsFromRequest,
  stringifyCrmExtensionForDb,
} from './customerCrmExtension.js'

test('parseCrmExtensionFromDb: null 또는 빈 문자열 → v1 + 빈 fields', () => {
  const a = parseCrmExtensionFromDb(null)
  assert.equal(a.v, 1)
  assert.deepEqual(a.fields, {})
})

test('sanitizeCrmExtensionFieldsFromRequest: { fields: { gym.a: " x " } } 허용 키만 유지·트림 키', () => {
  const out = sanitizeCrmExtensionFieldsFromRequest({
    fields: { 'gym.memberCode': '  M01  ', '$$bad$$': 'nope' },
  })
  assert.equal(out['gym.memberCode'], '  M01  ')
  assert.equal(Object.prototype.hasOwnProperty.call(out, '$$bad$$'), false)
})

test('stringifyCrmExtensionForDb: undefined 거쳐도 유효 JSON { v:1, fields:{} }', () => {
  const s = stringifyCrmExtensionForDb(undefined)
  const o = JSON.parse(s)
  assert.equal(o.v, 1)
  assert.deepEqual(o.fields, {})
})

test('확장 키·값 길이 상한 적용 — 값은 VALUE_MAX 까지만', () => {
  const longVal = 'a'.repeat(9000)
  const out = sanitizeCrmExtensionFieldsFromRequest({ 'government.unit': longVal })
  assert.equal(out['government.unit'].length, 8000)
})
