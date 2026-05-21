import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  buildGaNameExactMatchSet,
  gaInsuredValueMatchesCustomer,
  normalizeGaExactMatchValue,
  parseGaMatchAliasInput,
  sanitizeGaMatchAliasesForSave,
} from './gaCustomerMatchAliases.js'

test('normalizeGaExactMatchValue: trim only', () => {
  assert.equal(normalizeGaExactMatchValue(' 이지은 '), '이지은')
})

test('customerName only: 이지은 match, others no', () => {
  assert.equal(gaInsuredValueMatchesCustomer('이지은', [], '이지은'), true)
  assert.equal(gaInsuredValueMatchesCustomer('이지은', [], '이지은영'), false)
  assert.equal(gaInsuredValueMatchesCustomer('이지은', [], '이지은(S3)'), false)
})

test('with alias 이지은(S3)', () => {
  const aliases = ['이지은(S3)']
  assert.equal(gaInsuredValueMatchesCustomer('이지은', aliases, '이지은'), true)
  assert.equal(gaInsuredValueMatchesCustomer('이지은', aliases, '이지은(S3)'), true)
  assert.equal(gaInsuredValueMatchesCustomer('이지은', aliases, '이지은영'), false)
  assert.equal(gaInsuredValueMatchesCustomer('이지은', aliases, '이지은(S4)'), false)
})

test('parseGaMatchAliasInput: newline and comma', () => {
  const parsed = parseGaMatchAliasInput('이지은(S3)\n이지은 S3, 이지은-추가')
  assert.deepEqual(parsed, ['이지은(S3)', '이지은 S3', '이지은-추가'])
})

test('sanitizeGaMatchAliasesForSave: dedupe and drop customer name', () => {
  const saved = sanitizeGaMatchAliasesForSave(['이지은', '이지은(S3)', '이지은(S3)'], '이지은')
  assert.deepEqual(saved, ['이지은(S3)'])
})

test('buildGaNameExactMatchSet includes customer name', () => {
  const set = buildGaNameExactMatchSet('이지은', ['이지은(S3)'])
  assert.equal(set.has('이지은'), true)
  assert.equal(set.has('이지은(S3)'), true)
  assert.equal(set.size, 2)
})
