import { getRedis } from '../lib/redisClient.js'
import { logSmsCircuitOpen } from './smsStructuredLog.js'

const STREAK_KEY = 'sms:cb:streak'
const OPEN_KEY = 'sms:cb:open'
const STREAK_THRESHOLD = 3
const OPEN_TTL_SEC = 60

/** @type {number} */
let memStreak = 0
/** @type {number} */
let memOpenUntil = 0

function memIsOpen() {
  return Date.now() < memOpenUntil
}

function memOnSuccess() {
  memStreak = 0
}

function memOnFailure() {
  memStreak += 1
  if (memStreak >= STREAK_THRESHOLD) {
    memOpenUntil = Date.now() + OPEN_TTL_SEC * 1000
    memStreak = 0
    logSmsCircuitOpen({ backend: 'memory', ttlSec: OPEN_TTL_SEC })
  }
}

/**
 * @returns {Promise<{ allowed: boolean, retryAfterSec?: number }>}
 */
export async function assertSmsCircuitClosed() {
  const r = getRedis()
  if (!r) {
    if (memIsOpen()) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((memOpenUntil - Date.now()) / 1000)) }
    }
    return { allowed: true }
  }
  try {
    const t = await r.ttl(OPEN_KEY)
    if (t > 0) {
      return { allowed: false, retryAfterSec: t }
    }
    return { allowed: true }
  } catch {
    if (memIsOpen()) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((memOpenUntil - Date.now()) / 1000)) }
    }
    return { allowed: true }
  }
}

export async function recordSmsSendSuccess() {
  const r = getRedis()
  memOnSuccess()
  if (!r) {
    return
  }
  try {
    await r.del(STREAK_KEY)
  } catch {
    /* ignore */
  }
}

export async function recordSmsSendFailure() {
  const r = getRedis()
  memOnFailure()
  if (!r) {
    return
  }
  try {
    const n = await r.incr(STREAK_KEY)
    if (n === 1) {
      await r.expire(STREAK_KEY, OPEN_TTL_SEC * 2)
    }
    if (n >= STREAK_THRESHOLD) {
      await r.set(OPEN_KEY, '1', 'EX', OPEN_TTL_SEC)
      await r.del(STREAK_KEY)
      logSmsCircuitOpen({ backend: 'redis', ttlSec: OPEN_TTL_SEC })
    }
  } catch {
    /* memory path already updated */
  }
}
