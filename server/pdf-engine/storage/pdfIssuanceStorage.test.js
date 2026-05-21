/**
 * 발급 이력 스토리지 key 빌더 테스트.
 *
 * 외부 I/O 는 테스트 대상이 아니다(R2/로컬 폴백은 consentStorage 가 책임).
 * 여기서는 "경로 규칙" 과 "UUID 로 충돌이 나지 않는다" 만 계약으로 고정한다.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildIssuanceStorageKey } from './pdfIssuanceStorage.js'

test('buildIssuanceStorageKey: pdf-issuances/YYYY/MM/uuid.pdf 형식', () => {
  const fixed = new Date(Date.UTC(2026, 3, 15, 10, 0, 0))
  const key = buildIssuanceStorageKey(fixed)
  assert.match(key, /^pdf-issuances\/2026\/04\/[0-9a-f-]{36}\.pdf$/)
})

test('buildIssuanceStorageKey: 같은 시각 호출도 UUID 가 달라 충돌이 없다', () => {
  const fixed = new Date(Date.UTC(2026, 0, 1, 0, 0, 0))
  const a = buildIssuanceStorageKey(fixed)
  const b = buildIssuanceStorageKey(fixed)
  assert.notEqual(a, b)
})

test('buildIssuanceStorageKey: 월은 항상 2자리 zero-pad', () => {
  const jan = buildIssuanceStorageKey(new Date(Date.UTC(2026, 0, 1)))
  assert.match(jan, /\/2026\/01\//)
  const dec = buildIssuanceStorageKey(new Date(Date.UTC(2026, 11, 31)))
  assert.match(dec, /\/2026\/12\//)
})
