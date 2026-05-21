/**
 * PDF 자동화 엔진 — 스키마 검증 테이블-드리븐 테스트.
 *
 * 이 테스트는 "도메인 계약" 그 자체다 — 통과해야 관리자 UI/렌더러가 신뢰할 수 있다.
 * 실행: `npm test` (node:test, 외부 의존성 없음)
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ALLOWED_FIELD_TYPES,
  normalizeFieldSpec,
  normalizeFieldSpecList,
  validateRenderValues,
} from './fieldSpec.js'

function makeField(overrides = {}) {
  return {
    fieldKey: 'name',
    label: '성명',
    fieldType: 'text',
    required: true,
    orderIndex: 0,
    inputRole: 'customer',
    placements: [{ page: 0, x: 100, y: 200, align: 'left' }],
    ...overrides,
  }
}

test('normalizeFieldSpec: 허용 타입(text/textarea/checkbox/radio/signature) 모두 통과', () => {
  for (const t of ALLOWED_FIELD_TYPES) {
    /* 선택형 필드는 options + placement.optionValue 가 있어야 하므로 별도 빌더 사용 */
    if (t === 'radio') {
      const out = normalizeFieldSpec(
        makeField({
          fieldType: 'radio',
          options: ['A', 'B'],
          placements: [{ page: 0, x: 10, y: 10, optionValue: 'A' }],
        }),
      )
      assert.equal(out.fieldType, 'radio')
      assert.deepEqual(out.options, ['A', 'B'])
      assert.equal(out.placements[0].optionValue, 'A')
      continue
    }
    if (t === 'checkbox') {
      const out = normalizeFieldSpec(
        makeField({
          fieldType: 'checkbox',
          options: ['A', 'B'],
          placements: [{ page: 0, x: 10, y: 10, optionValue: 'A' }],
        }),
      )
      assert.equal(out.fieldType, 'checkbox')
      assert.deepEqual(out.options, ['A', 'B'])
      assert.equal(out.placements[0].optionValue, 'A')
      continue
    }
    const out = normalizeFieldSpec(makeField({ fieldType: t }))
    assert.equal(out.fieldType, t)
  }
})

test('normalizeFieldSpec: signature 은 입력 주체 설계사(sender) 불가', () => {
  assert.throws(
    () =>
      normalizeFieldSpec(
        makeField({
          fieldType: 'signature',
          inputRole: 'sender',
          placements: [{ page: 0, x: 1, y: 1 }],
        }),
      ),
    /설계사/,
  )
})

test('normalizeFieldSpec: signature 는 입력 주체 고객으로 정규화', () => {
  const out = normalizeFieldSpec(
    makeField({ fieldType: 'signature', placements: [{ page: 0, x: 1, y: 1 }] }),
  )
  assert.equal(out.inputRole, 'customer')
})

test('normalizeFieldSpec: 비허용 타입(select/email) 은 에러', () => {
  for (const t of ['select', 'email']) {
    assert.throws(() => normalizeFieldSpec(makeField({ fieldType: t })), /허용되지 않는/)
  }
})

test('normalizeFieldSpec: radio 는 options 가 최소 1개 필요', () => {
  assert.throws(
    () =>
      normalizeFieldSpec(
        makeField({ fieldType: 'radio', options: [], placements: [{ page: 0, x: 1, y: 1 }] }),
      ),
    /옵션/,
  )
})

test('normalizeFieldSpec: radio placement.optionValue 가 options 에 없으면 에러', () => {
  assert.throws(
    () =>
      normalizeFieldSpec(
        makeField({
          fieldType: 'radio',
          options: ['A'],
          placements: [{ page: 0, x: 1, y: 1, optionValue: 'B' }],
        }),
      ),
    /옵션 목록/,
  )
})

test('normalizeFieldSpec: checkbox/radio 가 아닌 타입에 options 가 오면 null 로 버림', () => {
  const out = normalizeFieldSpec(
    makeField({ fieldType: 'text', options: ['A', 'B'] }),
  )
  assert.equal(out.options, null)
})

test('normalizeFieldSpec: checkbox 는 options + placement.optionValue 를 필수로 가진다', () => {
  const out = normalizeFieldSpec(
    makeField({
      fieldType: 'checkbox',
      options: ['고객 동의', '마케팅 동의'],
      placements: [{ page: 0, x: 1, y: 1, optionValue: '고객 동의' }],
    }),
  )
  assert.deepEqual(out.options, ['고객 동의', '마케팅 동의'])
})

test('normalizeFieldSpec: fieldKey 네이밍 규칙 위반', () => {
  const bad = ['', '1name', 'Name', '이름', 'a'.repeat(65), 'a name']
  for (const key of bad) {
    assert.throws(() => normalizeFieldSpec(makeField({ fieldKey: key })), /key/)
  }
})

test('normalizeFieldSpec: placement.x/y 가 음수이거나 누락이면 에러', () => {
  assert.throws(
    () => normalizeFieldSpec(makeField({ placements: [{ page: 0, x: -1, y: 10 }] })),
    /x.*y/,
  )
  assert.throws(
    () => normalizeFieldSpec(makeField({ placements: [{ page: 0, x: 10 }] })),
    /x.*y/,
  )
})

test('normalizeFieldSpec: align 값 정규화 (허용값 유지, 그 외는 left)', () => {
  const left = normalizeFieldSpec(makeField({ placements: [{ page: 0, x: 1, y: 1, align: 'left' }] }))
  const center = normalizeFieldSpec(
    makeField({ placements: [{ page: 0, x: 1, y: 1, align: 'center' }] }),
  )
  const weird = normalizeFieldSpec(makeField({ placements: [{ page: 0, x: 1, y: 1, align: 'weird' }] }))
  assert.equal(left.placements[0].align, 'left')
  assert.equal(center.placements[0].align, 'center')
  assert.equal(weird.placements[0].align, 'left')
})

test('normalizeFieldSpecList: 배열이 아니면 에러, key 중복 시 에러', () => {
  assert.throws(() => normalizeFieldSpecList({}), /배열/)
  assert.throws(
    () => normalizeFieldSpecList([makeField({ fieldKey: 'x' }), makeField({ fieldKey: 'x' })]),
    /중복/,
  )
})

test('validateRenderValues: 필수 signature 는 텍스트 맵에 없어도 통과 (서명은 별도 플로우)', () => {
  const fields = [
    normalizeFieldSpec(
      makeField({ fieldKey: 'sig', label: '서명', fieldType: 'signature', required: true }),
    ),
  ]
  const r = validateRenderValues(fields, { sig: '' })
  assert.equal(r.ok, true)
})

test('validateRenderValues: 필수 필드 누락은 거부', () => {
  const fields = [normalizeFieldSpec(makeField({ required: true }))]
  const r = validateRenderValues(fields, { name: '   ' })
  assert.equal(r.ok, false)
})

test('validateRenderValues: date 타입은 더 이상 허용되지 않음', () => {
  assert.throws(
    () => normalizeFieldSpec(makeField({ fieldKey: 'dob', fieldType: 'date', required: true })),
    /허용되지 않는/,
  )
})

test('validateRenderValues: 통과 시 값은 trim 된 문자열 맵', () => {
  const fields = [normalizeFieldSpec(makeField({ required: false }))]
  const r = validateRenderValues(fields, { name: '  홍길동  ' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.normalized.name, '홍길동')
})

test('validateRenderValues: checkbox 는 JSON 배열 문자열만 허용', () => {
  const fields = [
    normalizeFieldSpec(
      makeField({
        fieldKey: 'agree',
        fieldType: 'checkbox',
        required: false,
        options: ['고객', '마케팅'],
        placements: [{ page: 0, x: 10, y: 10, optionValue: '고객' }],
      }),
    ),
  ]
  assert.equal(validateRenderValues(fields, { agree: '["고객"]' }).ok, true)
  assert.equal(validateRenderValues(fields, { agree: '["고객","마케팅"]' }).ok, true)
  assert.equal(validateRenderValues(fields, { agree: '' }).ok, true)
  assert.equal(validateRenderValues(fields, { agree: 'yes' }).ok, false)
  assert.equal(validateRenderValues(fields, { agree: '["기타"]' }).ok, false)
})

test('validateRenderValues: checkbox required 는 최소 1개 이상 선택 시 통과', () => {
  const fields = [
    normalizeFieldSpec(
      makeField({
        fieldKey: 'agree',
        fieldType: 'checkbox',
        required: true,
        options: ['고객', '마케팅'],
        placements: [{ page: 0, x: 10, y: 10, optionValue: '고객' }],
      }),
    ),
  ]
  assert.equal(validateRenderValues(fields, { agree: '["고객"]' }).ok, true)
  assert.equal(validateRenderValues(fields, { agree: '[]' }).ok, false)
  assert.equal(validateRenderValues(fields, { agree: '' }).ok, false)
})

test('validateRenderValues: radio 는 options 중 하나여야 함', () => {
  const fields = [
    normalizeFieldSpec(
      makeField({
        fieldKey: 'gender',
        fieldType: 'radio',
        required: true,
        options: ['M', 'F'],
        placements: [
          { page: 0, x: 1, y: 1, optionValue: 'M' },
          { page: 0, x: 2, y: 1, optionValue: 'F' },
        ],
      }),
    ),
  ]
  assert.equal(validateRenderValues(fields, { gender: 'M' }).ok, true)
  assert.equal(validateRenderValues(fields, { gender: 'X' }).ok, false)
  assert.equal(validateRenderValues(fields, { gender: '' }).ok, false)
})
