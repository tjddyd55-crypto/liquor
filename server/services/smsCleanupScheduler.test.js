import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  isTransientDatabaseNetworkError,
  resetSmsCleanupSchedulerStateForTests,
  runScheduledSmsCleanup,
} from './smsCleanupScheduler.js'

describe('smsCleanupScheduler', () => {
  beforeEach(() => {
    resetSmsCleanupSchedulerStateForTests()
  })

  it('isTransientDatabaseNetworkError detects EAI_AGAIN', () => {
    assert.equal(isTransientDatabaseNetworkError({ code: 'EAI_AGAIN', message: 'getaddrinfo' }), true)
    assert.equal(isTransientDatabaseNetworkError(new Error('syntax error at line 1')), false)
  })

  it('transient pool error logs warn not error', async () => {
    const logs = []
    const origWarn = console.warn
    const origError = console.error
    console.warn = (...a) => logs.push(['warn', a[0]])
    console.error = (...a) => logs.push(['error', a[0]])
    try {
      const pool = {
        query: async () => {
          const err = new Error('getaddrinfo EAI_AGAIN postgres.railway.internal')
          err.code = 'EAI_AGAIN'
          throw err
        },
      }
      await runScheduledSmsCleanup(pool)
      assert.ok(logs.some((l) => l[0] === 'warn' && String(l[1]).includes('transient')))
      assert.equal(logs.filter((l) => l[0] === 'error').length, 0)
    } finally {
      console.warn = origWarn
      console.error = origError
    }
  })

  it('in-flight guard prevents overlapping purge', async () => {
    let queryCalls = 0
    const pool = {
      query: () =>
        new Promise((resolve) => {
          queryCalls += 1
          setTimeout(() => resolve({ rowCount: 0 }), 40)
        }),
    }
    await Promise.all([runScheduledSmsCleanup(pool), runScheduledSmsCleanup(pool)])
    assert.equal(queryCalls, 1)
  })

  it('non-transient SQL error still logs error', async () => {
    const logs = []
    const origWarn = console.warn
    const origError = console.error
    console.warn = (...a) => logs.push(['warn', a[0]])
    console.error = (...a) => logs.push(['error', a[0]])
    try {
      const pool = {
        query: async () => {
          throw new Error('relation "sms_verification_codes" does not exist')
        },
      }
      await runScheduledSmsCleanup(pool)
      assert.equal(logs.filter((l) => l[0] === 'error').length, 1)
    } finally {
      console.warn = origWarn
      console.error = origError
    }
  })
})
