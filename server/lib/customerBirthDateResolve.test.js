import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseBirthDateFromRrn, resolveCustomerBirthDateYmd } from './customerBirthDateResolve.js'

test('resolveCustomerBirthDateYmd: birth_date column', () => {
  assert.equal(resolveCustomerBirthDateYmd({ birthDate: '1990-01-02' }), '1990-01-02')
})

test('resolveCustomerBirthDateYmd: derives from ssn when birth_date empty', () => {
  assert.equal(
    resolveCustomerBirthDateYmd({ birthDate: null, ssn: '900102-1******' }),
    '1990-01-02',
  )
})

test('resolveCustomerBirthDateYmd: 2000s from ssn gender code 3', () => {
  assert.equal(
    resolveCustomerBirthDateYmd({ ssn: '001231-3******' }),
    '2000-12-31',
  )
})

test('parseBirthDateFromRrn: too short', () => {
  assert.equal(parseBirthDateFromRrn('900102'), null)
})
