import test from 'node:test'
import assert from 'node:assert/strict'
import { matchRepaymentByExactAlias } from './repaymentExactAliasMatcher.js'

const aliases = [
  { id: 1, customer_id: 10, support_contract_id: 100, normalized_alias_value: 'a', is_active: true },
  { id: 2, customer_id: 20, support_contract_id: null, normalized_alias_value: 'b', is_active: true },
]

test('exact alias match only for identical normalized value', () => {
  assert.equal(matchRepaymentByExactAlias('A', aliases).matchStatus, 'exact_alias_matched')
  assert.equal(matchRepaymentByExactAlias('A-', aliases).matchStatus, 'unmatched')
  assert.equal(matchRepaymentByExactAlias('A상환', aliases).matchStatus, 'unmatched')
  assert.equal(matchRepaymentByExactAlias('B', aliases).matchStatus, 'exact_alias_matched')
})

test('conflict when same normalized alias on different customers', () => {
  const conflictAliases = [
    ...aliases,
    { id: 3, customer_id: 30, support_contract_id: null, normalized_alias_value: 'a', is_active: true },
  ]
  assert.equal(matchRepaymentByExactAlias('A', conflictAliases).matchStatus, 'conflict')
})
