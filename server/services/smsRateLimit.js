/**
 * SMS 발송 간격·시간당 한도, 인증 실패 누적(동일 번호+IP).
 * Redis: sms:phone:{phone}:gap, sms:phone:{phone}:hour, sms:verify:{phone}:{ip}
 * purpose·user 식별자 인자는 호환용(검증 키는 휴대폰+IP만 사용).
 */

import { getRedis } from '../lib/redisClient.js'
import { logSmsRateLimitHit } from './smsStructuredLog.js'

const MIN_GAP_MS = 60_000
const SEND_WINDOW_MS = 60 * 60_000
const MAX_SENDS_PER_WINDOW = 5
const VERIFY_LOCKOUT_SEC = 300
const MAX_VERIFY_FAILS = 5

/** @type {Map<string, { lastSendAt: number, windowStart: number, count: number }>} */
const sendState = new Map()
/** @type {Map<string, { fails: number, lockedUntil: number }>} */
const verifyFailState = new Map()

function canonicalPhone(digits) {
  return String(digits ?? '').replace(/\D/g, '').slice(0, 20)
}

function ipKeySegment(ip) {
  return String(ip ?? '')
    .trim()
    .replace(/:/g, '_')
    .slice(0, 128)
}

/** @param {string} phoneDigits @param {string} clientIp */
function verifyStoreKey(phoneDigits, clientIp) {
  const p = canonicalPhone(phoneDigits)
  const i = ipKeySegment(clientIp)
  return `sms:verify:${p}:${i}`
}

function memoryCanRequest(purpose, phoneDigits) {
  const key = `${String(purpose)}|${canonicalPhone(phoneDigits)}`
  const now = Date.now()
  let s = sendState.get(key)
  if (!s) {
    s = { lastSendAt: 0, windowStart: now, count: 0 }
    sendState.set(key, s)
  }
  if (now - s.windowStart > SEND_WINDOW_MS) {
    s.windowStart = now
    s.count = 0
  }
  if (s.count >= MAX_SENDS_PER_WINDOW) {
    const retryAfterSec = Math.ceil((s.windowStart + SEND_WINDOW_MS - now) / 1000)
    return {
      ok: false,
      message: '인증번호 요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
      retryAfterSec: Math.max(1, retryAfterSec),
      scope: 'sms:hour',
    }
  }
  if (now - s.lastSendAt < MIN_GAP_MS) {
    const retryAfterSec = Math.ceil((MIN_GAP_MS - (now - s.lastSendAt)) / 1000)
    return {
      ok: false,
      message: '인증번호는 1분 간격으로 다시 요청할 수 있습니다.',
      retryAfterSec: Math.max(1, retryAfterSec),
      scope: 'sms:gap',
    }
  }
  s.lastSendAt = now
  s.count += 1
  return { ok: true }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, message: string, retryAfterSec?: number }>}
 */
export async function assertCanRequestSmsCode(purpose, phoneDigits) {
  void purpose
  const p = canonicalPhone(phoneDigits)
  if (!p) {
    return { ok: true }
  }

  const r = getRedis()
  if (!r) {
    const m = memoryCanRequest(purpose, phoneDigits)
    if (!m.ok && 'scope' in m) {
      logSmsRateLimitHit({ kind: 'sms_send', scope: m.scope, phone: p })
    }
    return m.ok ? { ok: true } : { ok: false, message: m.message, retryAfterSec: m.retryAfterSec }
  }

  const gapKey = `sms:phone:${p}:gap`
  const hourKey = `sms:phone:${p}:hour`

  try {
    const hourC = await r.incr(hourKey)
    if (hourC === 1) {
      await r.expire(hourKey, 3600)
    }
    if (hourC > MAX_SENDS_PER_WINDOW) {
      await r.decr(hourKey)
      const ttl = await r.ttl(hourKey)
      logSmsRateLimitHit({ kind: 'sms_send', scope: 'sms:hour', phone: p })
      return {
        ok: false,
        message: '인증번호 요청 횟수가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        retryAfterSec: Math.max(1, ttl > 0 ? ttl : 3600),
      }
    }

    const gapOk = await r.set(gapKey, '1', 'PX', MIN_GAP_MS, 'NX')
    if (gapOk !== 'OK') {
      await r.decr(hourKey)
      const pt = await r.pttl(gapKey)
      const retryAfterSec = Math.max(1, Math.ceil((pt > 0 ? pt : MIN_GAP_MS) / 1000))
      logSmsRateLimitHit({ kind: 'sms_send', scope: 'sms:gap', phone: p })
      return {
        ok: false,
        message: '인증번호는 1분 간격으로 다시 요청할 수 있습니다.',
        retryAfterSec,
      }
    }

    return { ok: true }
  } catch (e) {
    console.error('[smsRateLimit] assertCanRequest redis error, memory:', e instanceof Error ? e.message : e)
    const m = memoryCanRequest(purpose, phoneDigits)
    if (!m.ok && 'scope' in m) {
      logSmsRateLimitHit({ kind: 'sms_send', scope: `${m.scope}:fallback`, phone: p })
    }
    return m.ok ? { ok: true } : { ok: false, message: m.message, retryAfterSec: m.retryAfterSec }
  }
}

function memoryVerifyFail(phoneDigits, clientIp) {
  const key = `${canonicalPhone(phoneDigits)}|${ipKeySegment(clientIp)}`
  const now = Date.now()
  let v = verifyFailState.get(key)
  if (!v) {
    v = { fails: 0, lockedUntil: 0 }
    verifyFailState.set(key, v)
  }
  if (now < v.lockedUntil) {
    return
  }
  v.fails += 1
  if (v.fails >= MAX_VERIFY_FAILS) {
    v.lockedUntil = now + VERIFY_LOCKOUT_SEC * 1000
    v.fails = 0
  }
}

function memoryVerifyLocked(phoneDigits, clientIp) {
  const key = `${canonicalPhone(phoneDigits)}|${ipKeySegment(clientIp)}`
  const v = verifyFailState.get(key)
  if (!v || v.lockedUntil <= Date.now()) {
    return { ok: true }
  }
  const retryAfterSec = Math.ceil((v.lockedUntil - Date.now()) / 1000)
  return {
    ok: false,
    message: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
    retryAfterSec: Math.max(1, retryAfterSec),
  }
}

function memoryClearVerify(phoneDigits, clientIp) {
  const key = `${canonicalPhone(phoneDigits)}|${ipKeySegment(clientIp)}`
  verifyFailState.delete(key)
}

/**
 * @param {string} _purpose 호환용(무시)
 * @param {string} phoneDigits
 * @param {string} _usernameOrUserId 호환용(무시) — 키는 phone+IP만 사용
 * @param {string} [clientIp]
 */
export async function recordVerifyFailure(_purpose, phoneDigits, _usernameOrUserId, clientIp = '') {
  const p = canonicalPhone(phoneDigits)
  const ip = ipKeySegment(clientIp)
  if (!p) {
    return
  }

  const r = getRedis()
  if (!r) {
    memoryVerifyFail(phoneDigits, clientIp)
    return
  }

  const failKey = `${verifyStoreKey(p, ip)}:f`
  const lockKey = `${verifyStoreKey(p, ip)}:lock`
  try {
    const n = await r.incr(failKey)
    if (n === 1) {
      await r.expire(failKey, VERIFY_LOCKOUT_SEC * 2)
    }
    if (n >= MAX_VERIFY_FAILS) {
      await r.set(lockKey, '1', 'EX', VERIFY_LOCKOUT_SEC)
      await r.del(failKey)
    }
  } catch (e) {
    console.error('[smsRateLimit] recordVerifyFailure redis error:', e instanceof Error ? e.message : e)
    memoryVerifyFail(phoneDigits, clientIp)
  }
}

export async function assertNotVerifyLocked(_purpose, phoneDigits, _usernameOrUserId, clientIp = '') {
  const p = canonicalPhone(phoneDigits)
  const ip = ipKeySegment(clientIp)
  if (!p) {
    return { ok: true }
  }

  const r = getRedis()
  if (!r) {
    return memoryVerifyLocked(phoneDigits, clientIp)
  }

  const lockKey = `${verifyStoreKey(p, ip)}:lock`
  try {
    const t = await r.ttl(lockKey)
    if (t > 0) {
      logSmsRateLimitHit({ kind: 'verify_lock', scope: 'verify:lock', phone: p })
      return {
        ok: false,
        message: '인증 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.',
        retryAfterSec: t,
      }
    }
    return { ok: true }
  } catch (e) {
    console.error('[smsRateLimit] assertNotVerifyLocked redis error:', e instanceof Error ? e.message : e)
    return memoryVerifyLocked(phoneDigits, clientIp)
  }
}

export async function clearVerifyFailures(_purpose, phoneDigits, _usernameOrUserId, clientIp = '') {
  const p = canonicalPhone(phoneDigits)
  const ip = ipKeySegment(clientIp)
  if (!p) {
    return
  }

  const r = getRedis()
  if (!r) {
    memoryClearVerify(phoneDigits, clientIp)
    return
  }

  const base = verifyStoreKey(p, ip)
  try {
    await r.del(`${base}:f`, `${base}:lock`)
  } catch (e) {
    console.error('[smsRateLimit] clearVerifyFailures redis error:', e instanceof Error ? e.message : e)
    memoryClearVerify(phoneDigits, clientIp)
  }
}
