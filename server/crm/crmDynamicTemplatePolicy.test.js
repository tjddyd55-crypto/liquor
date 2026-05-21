import assert from 'node:assert/strict'
import { test } from 'node:test'
import { industryAllowsDynamicCrmCustomerTemplates } from './crmDynamicTemplatePolicy.js'

test('insurance industry does not load dynamic CRM templates', () => {
  assert.equal(industryAllowsDynamicCrmCustomerTemplates('insurance'), false)
  assert.equal(industryAllowsDynamicCrmCustomerTemplates('INSURANCE'), false)
})

test('non-empty non-insurance industries may load dynamic CRM templates', () => {
  assert.equal(industryAllowsDynamicCrmCustomerTemplates('gym'), true)
  assert.equal(industryAllowsDynamicCrmCustomerTemplates('liquor'), true)
})

test('missing industry code skips dynamic template path', () => {
  assert.equal(industryAllowsDynamicCrmCustomerTemplates(''), false)
  assert.equal(industryAllowsDynamicCrmCustomerTemplates(null), false)
})
