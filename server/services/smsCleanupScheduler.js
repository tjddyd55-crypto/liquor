/**
 * SMS 만료 코드 정리 — in-flight guard + transient DB/네트워크 오류 로그 throttle.
 * @module smsCleanupScheduler
 */

import { purgeExpiredSmsVerificationCodes } from './purgeExpiredSmsCodes.js'

const WARN_INTERVAL_MS = 5 * 60 * 1000

const TRANSIENT_CODES = new Set([
  'EAI_AGAIN',
  'ENOTFOUND',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
])

let isRunning = false
let lastWarnAt = 0
let suppressedTransientCount = 0

function isDebugLog() {
  return String(process.env.LOG_LEVEL ?? '').trim().toLowerCase() === 'debug'
}

/**
 * @param {unknown} err
 */
export function isTransientDatabaseNetworkError(err) {
  if (!err || typeof err !== 'object') {
    const msg = String(err ?? '').toLowerCase()
    return msg.includes('eai_again') || msg.includes('getaddrinfo')
  }
  const e = /** @type {{ code?: string, message?: string }} */ (err)
  const code = String(e.code ?? '').trim()
  if (code && TRANSIENT_CODES.has(code)) {
    return true
  }
  const msg = String(e.message ?? err).toLowerCase()
  return (
    msg.includes('eai_again') ||
    msg.includes('getaddrinfo') ||
    msg.includes('connection terminated') ||
    msg.includes('connection reset') ||
    msg.includes('timeout') ||
    msg.includes('too many clients')
  )
}

/**
 * @param {import('pg').Pool} pool
 */
export async function runScheduledSmsCleanup(pool) {
  if (isRunning) {
    return
  }
  isRunning = true
  try {
    const deleted = await purgeExpiredSmsVerificationCodes(pool)
    if (suppressedTransientCount > 0) {
      console.warn(
        `[sms-cleanup] recovered after ${suppressedTransientCount} transient failure(s); deleted=${deleted}`,
      )
      suppressedTransientCount = 0
      lastWarnAt = 0
    }
  } catch (err) {
    if (isTransientDatabaseNetworkError(err)) {
      suppressedTransientCount += 1
      const now = Date.now()
      if (now - lastWarnAt >= WARN_INTERVAL_MS) {
        lastWarnAt = now
        const code =
          err && typeof err === 'object' && 'code' in err && err.code
            ? String(err.code)
            : 'network'
        console.warn(`[sms-cleanup] skipped due to transient database/network error: ${code}`)
        if (suppressedTransientCount > 1) {
          console.warn(
            `[sms-cleanup] (${suppressedTransientCount} transient failures since last successful run)`,
          )
        }
        if (isDebugLog()) {
          console.warn(err)
        }
      }
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    console.error('[sms-cleanup] purge failed:', message)
    if (isDebugLog() && err instanceof Error && err.stack) {
      console.error(err.stack)
    }
  } finally {
    isRunning = false
  }
}

/** @internal 테스트용 상태 초기화 */
export function resetSmsCleanupSchedulerStateForTests() {
  isRunning = false
  lastWarnAt = 0
  suppressedTransientCount = 0
}
