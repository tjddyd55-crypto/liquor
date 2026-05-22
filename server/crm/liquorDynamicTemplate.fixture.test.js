import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeCrmCustomerManagementTemplateBody } from './crmCustomerManagementTemplateNormalize.js'
import { buildLiquorCompanyDynamicCrmTemplateBody } from './fixtures/liquorCompanyDynamicCrmTemplateBody.js'

test('fixture: 주류 동적 고객 템플릿 바디 normalize 통과 및 필드 수', () => {
  const body = buildLiquorCompanyDynamicCrmTemplateBody()
  const out = normalizeCrmCustomerManagementTemplateBody(body)
  assert.equal(out.ok, true)
  if (!out.ok) return
  const { data } = out
  assert.equal(data.industryCode, 'liquor')
  assert.equal(data.status, 'active')
  assert.equal(data.formFields.length, 5)
  assert.equal(data.listColumns.length, 4)
  assert.equal(data.detailTabs.length, 8)
  assert.equal(data.detailTabs[0]?.featureBinding, 'dynamic.liquor_basic')
  assert.deepEqual(data.sharedFeatureBindings, [
    'crm-storage-files',
    'crm-consultations',
    'crm-inline-notes',
  ])
  assert.ok(data.extensionFeatureBindings.includes('liquor-support-contracts'))
})
