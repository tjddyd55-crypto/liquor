import test from 'node:test'
import assert from 'node:assert/strict'
import { registerCustomerCarsApi } from './customerCarsApi.js'

test('registerCustomerCarsApi exports a function', () => {
  assert.equal(typeof registerCustomerCarsApi, 'function')
})

test('registerCustomerCarsApi accepts router + deps', () => {
  const calls = []
  const apiRouter = {
    get(path, ...handlers) {
      calls.push(['get', path, handlers.length])
    },
    post(path, ...handlers) {
      calls.push(['post', path, handlers.length])
    },
    patch(path, ...handlers) {
      calls.push(['patch', path, handlers.length])
    },
    delete(path, ...handlers) {
      calls.push(['delete', path, handlers.length])
    },
  }
  const requireAuth = () => () => {}
  const handleDbError = () => {}
  registerCustomerCarsApi(apiRouter, { pool: {}, requireAuth, handleDbError })
  assert.ok(calls.length >= 4)
})
