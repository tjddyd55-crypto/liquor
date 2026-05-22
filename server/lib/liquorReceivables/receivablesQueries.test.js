import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReceivablesContractsWhere,
  parseReceivablesContractFilters,
  parseReceivablesImportFilters,
} from './receivablesQueries.js'

test('parseReceivablesContractFilters defaults', () => {
  const f = parseReceivablesContractFilters({})
  assert.equal(f.limit, 100)
  assert.equal(f.offset, 0)
})

test('buildReceivablesContractsWhere adds balance filter', () => {
  const f = parseReceivablesContractFilters({ hasBalance: 'yes' })
  const { whereSql } = buildReceivablesContractsWhere(f, 1)
  assert.match(whereSql, /balance_amount > 0/)
})

test('parseReceivablesImportFilters default statuses', () => {
  const f = parseReceivablesImportFilters({})
  assert.deepEqual(f.statuses, ['unmatched', 'conflict', 'duplicate'])
})
