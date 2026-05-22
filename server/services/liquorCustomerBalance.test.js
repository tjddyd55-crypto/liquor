import { computeLiquorSupportContractBalance, parseLiquorRepaymentAmount } from '../services/liquorCustomerBalance.js'
import assert from 'node:assert/strict'
import test from 'node:test'

test('computeLiquorSupportContractBalance: planned - repaid + adjustment', () => {
  assert.equal(
    computeLiquorSupportContractBalance({
      totalRepaymentPlannedAmount: 1000000,
      repaidAmount: 300000,
      adjustmentAmount: 0,
    }),
    700000,
  )
  assert.equal(
    computeLiquorSupportContractBalance({
      totalRepaymentPlannedAmount: 500000,
      repaidAmount: 200000,
      adjustmentAmount: -10000,
    }),
    290000,
  )
})

test('parseLiquorRepaymentAmount rejects negative and non-finite values', () => {
  assert.equal(parseLiquorRepaymentAmount(1000), 1000)
  assert.equal(parseLiquorRepaymentAmount('1,500.5'), 1500.5)
  assert.equal(parseLiquorRepaymentAmount(-1), null)
  assert.equal(parseLiquorRepaymentAmount('abc'), null)
})
