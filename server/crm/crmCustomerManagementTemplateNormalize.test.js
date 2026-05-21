/**
 * 동적 고객관리 템플릿 저장 요청 — normalize / validation 단위 테스트
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { normalizeCrmCustomerManagementTemplateBody } from './crmCustomerManagementTemplateNormalize.js'

function validGymPayload() {
  return {
    name: '헬스장 샘플',
    industry_code: 'gym',
    description: 'test',
    form_fields: [
      { fieldKey: 'gym.code', label: '회원코드', type: 'text', storage: 'extension', order: 10 },
      {
        fieldKey: 'gym.plan',
        label: '플랜',
        type: 'select',
        storage: 'extension',
        order: 20,
        options: [{ value: 'basic', label: '베이직' }],
      },
    ],
    list_columns: [
      { columnKey: 'planCol', label: '플랜', sourceFieldKey: 'gym.plan', order: 10, visibleDefault: true },
    ],
    detail_tabs: [{ tabId: 'info', label: '정보', order: 10, fieldKeys: ['gym.code', 'gym.plan'] }],
  }
}

test('normalize: insurance 업종 동적 저장 거부', () => {
  const p = validGymPayload()
  const r = normalizeCrmCustomerManagementTemplateBody({
    ...p,
    industry_code: 'insurance',
  })
  assert.equal(r.ok, false)
  assert.equal(r.status, 400)
  assert.ok(String(r.message).includes('insurance'))
})

test('normalize: fieldKey 중복 시 거부', () => {
  const p = validGymPayload()
  p.form_fields = [
    p.form_fields[0],
    { ...p.form_fields[0], label: '다른 라벨' },
  ]
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('중복'))
})

test('normalize: select 는 options 필수', () => {
  const p = validGymPayload()
  p.form_fields = [{ fieldKey: 'gym.x', label: 'x', type: 'select', storage: 'extension', options: [] }]
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('options'))
})

test('normalize: select options duplicate value 거부', () => {
  const p = {
    name: 'dup opt',
    industry_code: 'gym',
    form_fields: [
      {
        fieldKey: 'gym.dup',
        label: 'dup',
        type: 'select',
        storage: 'extension',
        order: 10,
        options: [
          { value: 'x', label: '1' },
          { value: 'x', label: '2' },
        ],
      },
    ],
    list_columns: [
      { columnKey: 'c1', label: 'C', sourceFieldKey: 'gym.dup', order: 10, visibleDefault: true },
    ],
    detail_tabs: [{ tabId: 'main', label: 'M', order: 10, fieldKeys: ['gym.dup'] }],
  }
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('옵션 value가 중복'))
})

test('normalize: list_columns sourceFieldKey 가 form 에 없으면 거부', () => {
  const p = validGymPayload()
  p.list_columns = [{ columnKey: 'bad', label: 'L', sourceFieldKey: 'missing.key' }]
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('form_fields'))
})

test('normalize: detail_tabs fieldKeys 가 form 에 없으면 거부', () => {
  const p = validGymPayload()
  p.detail_tabs = [{ tabId: 't', label: '탭', fieldKeys: ['nope'] }]
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('form_fields'))
})

test('normalize: 유효한 gym 페이로드 허용', () => {
  const r = normalizeCrmCustomerManagementTemplateBody(validGymPayload())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.data.industryCode, 'gym')
  assert.equal(r.data.formFields.length, 2)
  assert.equal(r.data.listColumns[0].sourceFieldKey, 'gym.plan')
  assert.deepEqual(r.data.detailTabs[0].fieldKeys, ['gym.code', 'gym.plan'])
})

test('normalize: draft 상태 저장', () => {
  const r = normalizeCrmCustomerManagementTemplateBody({
    ...validGymPayload(),
    status: 'draft',
  })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.data.status, 'draft')
})

test('normalize: list column displayType date', () => {
  const p = validGymPayload()
  p.list_columns = [
    {
      columnKey: 'planCol',
      label: '플랜',
      sourceFieldKey: 'gym.plan',
      order: 10,
      visibleDefault: true,
      displayType: 'date',
    },
  ]
  const r = normalizeCrmCustomerManagementTemplateBody(p)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.data.listColumns[0].displayType, 'date')
})

test('normalize: 코어 저장은 허용 키만', () => {
  const r = normalizeCrmCustomerManagementTemplateBody({
    name: 'bad core',
    industry_code: 'gym',
    form_fields: [{ fieldKey: 'gym.only', label: 'x', type: 'text', storage: 'core', order: 1 }],
    list_columns: [],
    detail_tabs: [],
  })
  assert.equal(r.ok, false)
})

test('normalize: customer.birthDate 와 customer.ssn 동시 코어 필드 거부', () => {
  const r = normalizeCrmCustomerManagementTemplateBody({
    name: 'rrn mix',
    industry_code: 'gym',
    form_fields: [
      { fieldKey: 'customer.birthDate', label: '앞자리', type: 'text', storage: 'core', order: 10 },
      { fieldKey: 'customer.ssn', label: '주민', type: 'text', storage: 'core', order: 20 },
    ],
    list_columns: [
      { columnKey: 'n', label: 'N', sourceFieldKey: 'customer.birthDate', order: 10, visibleDefault: true },
    ],
    detail_tabs: [{ tabId: 'm', label: 'M', fieldKeys: ['customer.birthDate'] }],
  })
  assert.equal(r.ok, false)
  assert.ok(String(r.message).includes('birthDate') || String(r.message).includes('ssn'))
})
