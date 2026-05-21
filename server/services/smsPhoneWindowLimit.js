/**

 * 동일 전화번호 10분 창 최대 3회 발송(성공 시에만 카운트).

 * Redis: sms:phone:{phone} — 성공 시 INCR + 첫 건에 EXPIRE 600.

 */



import { getRedis } from '../lib/redisClient.js'

import { logSmsRateLimitHit } from './smsStructuredLog.js'



const WINDOW_SEC = 600

const MAX_IN_WINDOW = 3



/** @type {Map<string, { start: number, count: number }>} */

const store = new Map()



function canonicalPhone(digits) {

  return String(digits ?? '').replace(/\D/g, '').slice(0, 20)

}



function memoryAssert(phoneDigits) {

  const k = canonicalPhone(phoneDigits)

  if (!k) {

    return { ok: true }

  }

  const now = Date.now()

  let e = store.get(k)

  if (!e || now - e.start > WINDOW_SEC * 1000) {

    return { ok: true }

  }

  if (e.count >= MAX_IN_WINDOW) {

    return {

      ok: false,

      retryAfterSec: Math.max(1, Math.ceil((WINDOW_SEC * 1000 - (now - e.start)) / 1000)),

      phone: k,

    }

  }

  return { ok: true }

}



function memoryRecord(phoneDigits) {

  const k = canonicalPhone(phoneDigits)

  if (!k) {

    return

  }

  const now = Date.now()

  let e = store.get(k)

  if (!e || now - e.start > WINDOW_SEC * 1000) {

    e = { start: now, count: 0 }

    store.set(k, e)

  }

  e.count += 1

}



/**

 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSec: number }>}

 */

export async function assertPhoneSms10MinLimit(phoneDigits) {

  const k = canonicalPhone(phoneDigits)

  if (!k) {

    return { ok: true }

  }



  const r = getRedis()

  if (!r) {

    const m = memoryAssert(phoneDigits)

    if (!m.ok && 'phone' in m) {

      logSmsRateLimitHit({ kind: 'phone_window', scope: '10m', phone: k })

    }

    return m.ok ? { ok: true } : { ok: false, retryAfterSec: m.retryAfterSec }

  }



  const redisKey = `sms:phone:${k}`

  try {

    const n = await r.get(redisKey)

    const c = n == null ? 0 : Number(n)

    if (Number.isFinite(c) && c >= MAX_IN_WINDOW) {

      const ttl = await r.ttl(redisKey)

      logSmsRateLimitHit({ kind: 'phone_window', scope: '10m', phone: k })

      return { ok: false, retryAfterSec: Math.max(1, ttl > 0 ? ttl : WINDOW_SEC) }

    }

    return { ok: true }

  } catch (e) {

    console.error('[smsPhoneWindowLimit] redis error, fallback memory:', e instanceof Error ? e.message : e)

    const m = memoryAssert(phoneDigits)

    if (!m.ok && 'phone' in m) {

      logSmsRateLimitHit({ kind: 'phone_window', scope: '10m:fallback', phone: k })

    }

    return m.ok ? { ok: true } : { ok: false, retryAfterSec: m.retryAfterSec }

  }

}



/** 문자 발송 성공 직후 호출 */

export async function recordPhoneSms10MinSend(phoneDigits) {

  const k = canonicalPhone(phoneDigits)

  if (!k) {

    return

  }



  const r = getRedis()

  if (!r) {

    memoryRecord(phoneDigits)

    return

  }



  const redisKey = `sms:phone:${k}`

  try {

    const v = await r.incr(redisKey)

    if (v === 1) {

      await r.expire(redisKey, WINDOW_SEC)

    }

  } catch (e) {

    console.error('[smsPhoneWindowLimit] record redis error, fallback memory:', e instanceof Error ? e.message : e)

    memoryRecord(phoneDigits)

  }

}


