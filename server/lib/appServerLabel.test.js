import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  formatDbEngineMessage,
  formatServerListeningMessage,
  resolveServerProductLabel,
} from './appServerLabel.js'

describe('appServerLabel', () => {
  const prev = {}

  beforeEach(() => {
    for (const k of ['APP_PRODUCT', 'APP_INDUSTRY', 'CRM_R2_OBJECT_ROOT']) {
      prev[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ['APP_PRODUCT', 'APP_INDUSTRY', 'CRM_R2_OBJECT_ROOT']) {
      if (prev[k] === undefined) {
        delete process.env[k]
      } else {
        process.env[k] = prev[k]
      }
    }
  })

  it('defaults to Insurance', () => {
    assert.equal(resolveServerProductLabel(), 'Insurance')
  })

  it('APP_PRODUCT=government', () => {
    process.env.APP_PRODUCT = 'government'
    assert.equal(resolveServerProductLabel(), 'Government CRM')
    assert.match(formatServerListeningMessage(8080), /^Government CRM server listening/)
    assert.equal(formatDbEngineMessage(), 'Government CRM DB engine: PostgreSQL')
  })

  it('CRM_R2_OBJECT_ROOT government path', () => {
    process.env.CRM_R2_OBJECT_ROOT = 'crm-platform/development/government/tenants'
    assert.equal(resolveServerProductLabel(), 'Government CRM')
  })

  it('APP_PRODUCT=liquor', () => {
    process.env.APP_PRODUCT = 'liquor'
    assert.equal(resolveServerProductLabel(), 'Liquor CRM')
    assert.match(formatServerListeningMessage(8080), /^Liquor CRM server listening/)
    assert.equal(formatDbEngineMessage(), 'Liquor CRM DB engine: PostgreSQL')
  })
})
