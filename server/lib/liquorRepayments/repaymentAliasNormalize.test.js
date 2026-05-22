import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRepaymentAliasValue, maskAccountNumber } from './repaymentAliasNormalize.js'

test('normalizeRepaymentAliasValue trims and lowercases only', () => {
  assert.equal(normalizeRepaymentAliasValue('  A  '), 'a')
  assert.equal(normalizeRepaymentAliasValue('A-'), 'a-')
  assert.equal(normalizeRepaymentAliasValue('행복 포차'), '행복 포차')
  assert.notEqual(normalizeRepaymentAliasValue('행복 포차'), normalizeRepaymentAliasValue('행복포차'))
})

test('maskAccountNumber masks all but last 4', () => {
  assert.equal(maskAccountNumber('1234567890'), '******7890')
})
