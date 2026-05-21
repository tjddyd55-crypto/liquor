/**
 * SMS 인증 요청 IP 기반 제한.
 * Redis: sms:ip:{ip}:min, sms:ip:{ip}:hour — INCR + EXPIRE (다중 인스턴스 공통).
 * REDIS_URL 없을 때 인메모리(단일 인스턴스).
 */

import { getRedis } from '../lib/redisClient.js'
import { logSmsRateLimitHit } from './smsStructuredLog.js'

const MINUTE_MS = 60_000
const MAX_PER_MINUTE = 5
const HOUR_MS = 3_600_000
const MAX_PER_HOUR = 20

/** @type {Map<string, { minuteStart: number, minuteCount: number, hourStart: number, hourCount: number }>} */
const ipStore = new Map()

function ipKeySegment(ip) {
  return String(ip ?? 'unknown')
    .trim()
    .replace(/:/g, '_')
    .slice(0, 128)
}

export function getClientIp(req) {
  const xff = req.headers?.['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0].trim()
  }
  if (Array.isArray(xff) && typeof xff[0] === 'string' && xff[0].trim()) {
    return xff[0].split(',')[0].trim()
  }
  if (typeof req.ip === 'string' && req.ip.trim()) {
    return req.ip.trim()
  }
  const ra = req.socket?.remoteAddress
  return typeof ra === 'string' && ra.trim() ? ra.trim() : 'unknown'
}

/** 감사 로그용 User-Agent (길이 제한) */
export function getClientUserAgent(req) {
  const h = req.headers?.['user-agent']
  if (typeof h === 'string' && h.trim()) {
    return h.trim().slice(0, 512)
  }
  return ''
}

function memoryAssert(req) {
  const ip = getClientIp(req)
  const now = Date.now()
  let e = ipStore.get(ip)
  if (!e) {
    e = { minuteStart: now, minuteCount: 0, hourStart: now, hourCount: 0 }
    ipStore.set(ip, e)
  }

  if (now - e.minuteStart >= MINUTE_MS) {
    e.minuteStart = now
    e.minuteCount = 0
  }
  if (now - e.hourStart >= HOUR_MS) {
    e.hourStart = now
    e.hourCount = 0
  }

  if (e.minuteCount >= MAX_PER_MINUTE) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((MINUTE_MS - (now - e.minuteStart)) / 1000)),
      scope: 'ip:minute',
      ip,
    }
  }
  if (e.hourCount >= MAX_PER_HOUR) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((HOUR_MS - (now - e.hourStart)) / 1000)),
      scope: 'ip:hour',
      ip,
    }
  }

  e.minuteCount += 1
  e.hourCount += 1
  return { ok: true }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, retryAfterSec: number }>}
 */
export async function assertSmsRequestIpLimit(req) {
  const ip = getClientIp(req)
  const seg = ipKeySegment(ip)
  const r = getRedis()

  if (!r) {
    const m = memoryAssert(req)
    if (!m.ok && 'scope' in m) {
      logSmsRateLimitHit({ kind: 'ip', scope: m.scope, ip: seg })
    }
    return m.ok ? { ok: true } : { ok: false, retryAfterSec: m.retryAfterSec }
  }

  try {
    const minK = `sms:ip:${seg}:min`
    const hourK = `sms:ip:${seg}:hour`
    const minC = await r.incr(minK)
    if (minC === 1) {
      await r.expire(minK, 60)
    }
    if (minC > MAX_PER_MINUTE) {
      await r.decr(minK)
      const ttl = await r.ttl(minK)
      logSmsRateLimitHit({ kind: 'ip', scope: 'ip:minute', ip: seg })
      return { ok: false, retryAfterSec: Math.max(1, ttl > 0 ? ttl : 60) }
    }

    const hourC = await r.incr(hourK)
    if (hourC === 1) {
      await r.expire(hourK, 3600)
    }
    if (hourC > MAX_PER_HOUR) {
      await r.decr(minK)
      await r.decr(hourK)
      const ttl = await r.ttl(hourK)
      logSmsRateLimitHit({ kind: 'ip', scope: 'ip:hour', ip: seg })
      return { ok: false, retryAfterSec: Math.max(1, ttl > 0 ? ttl : 3600) }
    }

    return { ok: true }
  } catch (e) {
    console.error('[smsRequestIpLimit] redis error, fallback memory:', e instanceof Error ? e.message : e)
    const m = memoryAssert(req)
    if (!m.ok && 'scope' in m) {
      logSmsRateLimitHit({ kind: 'ip', scope: `${m.scope}:fallback`, ip: seg })
    }
    return m.ok ? { ok: true } : { ok: false, retryAfterSec: m.retryAfterSec }
  }
}
