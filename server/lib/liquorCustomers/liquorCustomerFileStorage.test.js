import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertLiquorCustomerFileObjectKey,
  buildLiquorCustomerFileObjectKey,
  sanitizeLiquorCustomerFileName,
} from './liquorCustomerFileStorage.js'

test('sanitizeLiquorCustomerFileName keeps Korean and safe chars', () => {
  assert.equal(sanitizeLiquorCustomerFileName('사업자등록증.pdf'), '사업자등록증.pdf')
  assert.equal(sanitizeLiquorCustomerFileName('bad/name?.pdf'), 'bad_name_.pdf')
})

test('buildLiquorCustomerFileObjectKey uses liquor customer-files prefix', () => {
  const key = buildLiquorCustomerFileObjectKey({
    gaId: 111,
    customerId: 27,
    fileId: 99,
    fileName: 'test.pdf',
  })
  assert.match(key, /liquor\/customer-files\/111\/27\/99\/test\.pdf$/)
})

test('assertLiquorCustomerFileObjectKey validates expected segments', () => {
  const key = buildLiquorCustomerFileObjectKey({
    gaId: 111,
    customerId: 27,
    fileId: 99,
    fileName: 'test.pdf',
  })
  assert.equal(
    assertLiquorCustomerFileObjectKey(key, { gaId: 111, customerId: 27, fileId: 99 }),
    true,
  )
  assert.equal(
    assertLiquorCustomerFileObjectKey(key, { gaId: 112, customerId: 27, fileId: 99 }),
    false,
  )
})
