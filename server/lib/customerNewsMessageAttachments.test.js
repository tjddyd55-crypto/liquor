import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  assertCustomerNewsMessageObjectKey,
  buildCustomerNewsMessageObjectKey,
  validateCustomerNewsMessageUpload,
} from './customerNewsMessageAttachments.js'

test('validateCustomerNewsMessageUpload: image ok', () => {
  const r = validateCustomerNewsMessageUpload('image/jpeg', 1024)
  assert.equal(r.ok, true)
})

test('validateCustomerNewsMessageUpload: pdf ok', () => {
  const r = validateCustomerNewsMessageUpload('application/pdf', 1024)
  assert.equal(r.ok, true)
})

test('validateCustomerNewsMessageUpload: rejects doc', () => {
  const r = validateCustomerNewsMessageUpload('application/msword', 1024)
  assert.equal(r.ok, false)
})

test('assertCustomerNewsMessageObjectKey: agent scoped', () => {
  const key = buildCustomerNewsMessageObjectKey('ga1', 'agent-1', 'test.pdf')
  assert.equal(assertCustomerNewsMessageObjectKey(key, 'agent-1', 'ga1'), true)
  assert.equal(assertCustomerNewsMessageObjectKey(key, 'agent-2', 'ga1'), false)
})
