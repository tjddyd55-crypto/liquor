import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseFieldDataMapping } from '../schema/fieldDataMapping.js'
import { applyCustomerMappingToValues, resolvePdfFieldValue } from './resolvePdfFieldValue.js'

const sampleCustomer = {
  name: '홍길동',
  phone: '01012345678',
  birthDate: '1990-01-02',
}

test('parseFieldDataMapping: legacy name string', () => {
  const m = parseFieldDataMapping('name')
  assert.equal(m.dataSourceType, 'customer')
  assert.equal(m.customerFieldKey, 'name')
})

test('resolvePdfFieldValue: manual value wins when not overwrite', () => {
  const field = {
    dataMapping: {
      dataSourceType: 'customer',
      customerFieldKey: 'name',
      customerFieldLabel: '고객명',
      fallbackText: null,
      transformType: null,
    },
  }
  assert.equal(
    resolvePdfFieldValue({ field, manualValue: '직접', customer: sampleCustomer }),
    '직접',
  )
})

test('resolvePdfFieldValue: fills from customer when manual empty', () => {
  const field = {
    dataMapping: {
      dataSourceType: 'customer',
      customerFieldKey: 'phone',
      customerFieldLabel: '연락처',
      fallbackText: null,
      transformType: null,
    },
  }
  assert.equal(resolvePdfFieldValue({ field, manualValue: '', customer: sampleCustomer }), '01012345678')
})

test('applyCustomerMappingToValues: empty manual only', () => {
  const fields = [
    {
      fieldKey: 'customer_name',
      dataMapping: {
        dataSourceType: 'customer',
        customerFieldKey: 'name',
        customerFieldLabel: null,
        fallbackText: null,
        transformType: null,
      },
    },
    { fieldKey: 'memo', dataMapping: { dataSourceType: 'manual', customerFieldKey: null, customerFieldLabel: null, fallbackText: null, transformType: null } },
  ]
  const out = applyCustomerMappingToValues(fields, { customer_name: '', memo: '유지' }, sampleCustomer)
  assert.equal(out.customer_name, '홍길동')
  assert.equal(out.memo, '유지')
})

test('resolvePdfFieldValue: birthDate from ssn when birthDate column empty', () => {
  const field = {
    dataMapping: {
      dataSourceType: 'customer',
      customerFieldKey: 'birthDate',
      customerFieldLabel: '생년월일',
      fallbackText: null,
      transformType: null,
    },
  }
  assert.equal(
    resolvePdfFieldValue({
      field,
      manualValue: '',
      customer: { name: '테스트', birthDate: null, ssn: '900102-1******' },
    }),
    '1990-01-02',
  )
})

test('applyCustomerMappingToValues: overwrite mode', () => {
  const fields = [
    {
      fieldKey: 'customer_name',
      dataMapping: {
        dataSourceType: 'customer',
        customerFieldKey: 'name',
        customerFieldLabel: null,
        fallbackText: null,
        transformType: null,
      },
    },
  ]
  const out = applyCustomerMappingToValues(
    fields,
    { customer_name: '임의' },
    sampleCustomer,
    { overwriteMode: true },
  )
  assert.equal(out.customer_name, '홍길동')
})
