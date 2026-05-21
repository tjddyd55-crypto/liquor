/**
 * formatAddressForSave 계약 테스트.
 *
 * 대상:
 *   - 우편번호/기본주소/상세주소의 다양한 조합에서 "공백이 중복되지 않는다"
 *   - 빈 조각이 있을 때 포맷이 자연스럽게 축약된다
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { formatAddressForSave } from './addressSearchUtils'

test('formatAddressForSave: 우편번호 + 기본 + 상세 모두 있으면 단일 공백으로 합쳐진다', () => {
  const out = formatAddressForSave({
    zonecode: '06236',
    baseAddress: '서울특별시 강남구 테헤란로 123',
    detailAddress: '101동 1234호',
  })
  assert.equal(out, '(06236) 서울특별시 강남구 테헤란로 123 101동 1234호')
})

test('formatAddressForSave: 우편번호만 빠지면 괄호 블록이 생략된다', () => {
  const out = formatAddressForSave({
    zonecode: '',
    baseAddress: '서울특별시 강남구 테헤란로 123',
    detailAddress: '101동',
  })
  assert.equal(out, '서울특별시 강남구 테헤란로 123 101동')
})

test('formatAddressForSave: 상세주소가 없으면 끝에 공백이 남지 않는다', () => {
  const out = formatAddressForSave({
    zonecode: '06236',
    baseAddress: '서울특별시 강남구 테헤란로 123',
    detailAddress: '',
  })
  assert.equal(out, '(06236) 서울특별시 강남구 테헤란로 123')
})

test('formatAddressForSave: 전부 공백만 있으면 빈 문자열을 반환한다', () => {
  const out = formatAddressForSave({
    zonecode: '   ',
    baseAddress: '  ',
    detailAddress: '',
  })
  assert.equal(out, '')
})

test('formatAddressForSave: 각 조각의 앞뒤 공백은 trim 된다', () => {
  const out = formatAddressForSave({
    zonecode: '  06236 ',
    baseAddress: '  서울특별시 강남구 테헤란로 123 ',
    detailAddress: ' 101동  ',
  })
  assert.equal(out, '(06236) 서울특별시 강남구 테헤란로 123 101동')
})
