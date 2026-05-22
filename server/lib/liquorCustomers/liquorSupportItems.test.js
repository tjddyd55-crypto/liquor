import test from 'node:test'
import assert from 'node:assert/strict'
import {
  computeLiquorItemTotalAmount,
  parseLiquorItemMoney,
  parseLiquorItemQuantity,
  resolveLiquorSupportItemAmounts,
  validateLiquorSupportItemBusinessRules,
} from './liquorSupportItems.js'

test('parseLiquorItemQuantity rejects zero and negative', () => {
  assert.equal(parseLiquorItemQuantity(0), null)
  assert.equal(parseLiquorItemQuantity(-1), null)
  assert.equal(parseLiquorItemQuantity(2), 2)
})

test('parseLiquorItemMoney rejects negative', () => {
  assert.equal(parseLiquorItemMoney(-1), null)
  assert.equal(parseLiquorItemMoney('1,000.5'), 1000.5)
})

test('resolveLiquorSupportItemAmounts auto total from qty and unit', () => {
  const r = resolveLiquorSupportItemAmounts({ quantity: 3, unitPrice: 10000 })
  assert.equal(r.ok, true)
  assert.equal(r.totalAmount, 30000)
})

test('resolveLiquorSupportItemAmounts accepts explicit total override', () => {
  const r = resolveLiquorSupportItemAmounts({ quantity: 2, unitPrice: 10000, totalAmount: 25000 })
  assert.equal(r.ok, true)
  assert.equal(r.totalAmount, 25000)
})

test('validateLiquorSupportItemBusinessRules recovered requires date', () => {
  const r = validateLiquorSupportItemBusinessRules({ status: 'recovered' })
  assert.equal(r.ok, false)
})

test('validateLiquorSupportItemBusinessRules broken requires memo', () => {
  const r = validateLiquorSupportItemBusinessRules({ status: 'broken', memo: '   ' })
  assert.equal(r.ok, false)
})

test('computeLiquorItemTotalAmount', () => {
  assert.equal(computeLiquorItemTotalAmount(2, 1500.5), 3001)
})
