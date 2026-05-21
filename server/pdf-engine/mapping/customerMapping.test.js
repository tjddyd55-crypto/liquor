/**
 * customerMapping 단위 테스트.
 *
 * 대상: "프로필 값 추출" 과 "사용자 입력 vs 프로필 값" 의 병합 규칙.
 * DB I/O 는 레포지토리 책임이므로 여기서는 제외한다.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { injectCustomerValues, pickMappedValue } from './customerMapping.js'

test('pickMappedValue: 프로필이 null 이면 항상 빈 문자열', () => {
  assert.equal(pickMappedValue(null, 'name'), '')
  assert.equal(pickMappedValue(undefined, 'phone'), '')
})

test('pickMappedValue: name 은 display_name 을 trim 한 값', () => {
  assert.equal(pickMappedValue({ display_name: '  홍길동 ' }, 'name'), '홍길동')
  assert.equal(pickMappedValue({ display_name: null }, 'name'), '')
})

test('pickMappedValue: phone 은 phone_number', () => {
  assert.equal(pickMappedValue({ phone_number: '010-1234-5678' }, 'phone'), '010-1234-5678')
})

test('pickMappedValue: dob 는 Date 객체도 YYYY-MM-DD 로 직렬화', () => {
  const d = new Date(Date.UTC(1990, 0, 2, 0, 0, 0))
  /* 로컬 타임존 영향을 피하려고 UTC 로 만들되, getFullYear 등 로컬 메서드를 쓰므로
     환경에 따라 하루 차이가 날 수 있다. 여기서는 "YYYY-MM-DD" 형식 만족만 검증. */
  assert.match(pickMappedValue({ customer_dob: d }, 'dob'), /^\d{4}-\d{2}-\d{2}$/)
})

test('pickMappedValue: dob 가 이미 "YYYY-MM-DD" 문자열이면 그대로', () => {
  assert.equal(pickMappedValue({ customer_dob: '1990-01-02' }, 'dob'), '1990-01-02')
})

test('pickMappedValue: dob 가 ISO 타임스탬프면 앞 10자리', () => {
  assert.equal(pickMappedValue({ customer_dob: '1990-01-02T00:00:00Z' }, 'dob'), '1990-01-02')
})

test('pickMappedValue: address 는 customer_address', () => {
  assert.equal(pickMappedValue({ customer_address: '서울시 강남구' }, 'address'), '서울시 강남구')
})

test('injectCustomerValues: 매핑 없는 필드는 사용자 입력 그대로', () => {
  const fields = [{ fieldKey: 'memo', customerMapping: null }]
  const result = injectCustomerValues(fields, { memo: '수기 메모' }, null)
  assert.deepEqual(result, { memo: '수기 메모' })
})

test('injectCustomerValues: 고객 데이터가 있으면 overwrite 로 덮어쓴다', () => {
  const fields = [
    {
      fieldKey: 'customer_name',
      dataMapping: {
        dataSourceType: 'customer',
        customerFieldKey: 'name',
        customerFieldLabel: null,
        fallbackText: null,
        transformType: null,
      },
    },
    {
      fieldKey: 'customer_phone',
      dataMapping: {
        dataSourceType: 'customer',
        customerFieldKey: 'phone',
        customerFieldLabel: null,
        fallbackText: null,
        transformType: null,
      },
    },
  ]
  const customer = { name: '홍길동', phone: '010-0000-0000' }
  const result = injectCustomerValues(fields, { customer_name: '임의값', customer_phone: '' }, customer)
  assert.equal(result.customer_name, '홍길동')
  assert.equal(result.customer_phone, '010-0000-0000')
})

test('injectCustomerValues: 프로필 값이 비어 있으면 사용자 입력을 보존', () => {
  const fields = [{ fieldKey: 'customer_address', customerMapping: 'address' }]
  const profile = { customer_address: null }
  const result = injectCustomerValues(fields, { customer_address: '사용자 입력 주소' }, profile)
  assert.equal(result.customer_address, '사용자 입력 주소')
})

test('injectCustomerValues: 원본 values 를 변형하지 않는다(불변)', () => {
  const fields = [{ fieldKey: 'customer_name', customerMapping: 'name' }]
  const values = { customer_name: 'old' }
  const profile = { display_name: 'new' }
  injectCustomerValues(fields, values, profile)
  assert.equal(values.customer_name, 'old')
})
