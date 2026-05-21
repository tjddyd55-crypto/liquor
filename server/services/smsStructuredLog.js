/**
 * SMS 발송·인증 시도 관측 로그 (민감값·URL·API 키 미포함).
 */

import { insuranceLog } from '../lib/logger.js'

const deliveryLog = insuranceLog.child({ domain: 'sms-delivery' })
const verifyLog = insuranceLog.child({ domain: 'sms-verify' })
const cleanupLog = insuranceLog.child({ domain: 'sms-cleanup' })
const policyLog = insuranceLog.child({ domain: 'sms-policy' })

export function maskPhoneForLog(phoneDigits) {
  const d = String(phoneDigits ?? '').replace(/\D/g, '')
  if (d.length < 4) {
    return '***'
  }
  return `***${d.slice(-4)}`
}

/**
 * @param {{ phone: string, ip: string, status: string, purpose: string, channel?: string }} p
 */
export function logSmsDelivery(p) {
  deliveryLog.info({
    phone: maskPhoneForLog(p.phone),
    ip: String(p.ip ?? '').slice(0, 64),
    status: String(p.status),
    purpose: String(p.purpose ?? ''),
    channel: p.channel ? String(p.channel) : undefined,
    timestamp: new Date().toISOString(),
  })
}

/**
 * 인증코드 검증 실패 등
 * @param {{ phone: string, ip: string, status: string, purpose: string }} p
 */
export function logSmsVerifyFailure(p) {
  verifyLog.info({
    phone: maskPhoneForLog(p.phone),
    ip: String(p.ip ?? '').slice(0, 64),
    status: String(p.status),
    purpose: String(p.purpose ?? ''),
    timestamp: new Date().toISOString(),
  })
}

export function logExpiredSmsCodesPurged(deletedCount) {
  cleanupLog.info({
    deleted: deletedCount,
    timestamp: new Date().toISOString(),
  })
}

/**
 * @param {{ kind: string, scope: string, phone?: string, ip?: string }} p
 */
export function logSmsRateLimitHit(p) {
  policyLog.info({
    event: 'rate_limit_hit',
    kind: String(p.kind),
    scope: String(p.scope),
    phone: p.phone ? maskPhoneForLog(p.phone) : undefined,
    ip: p.ip != null ? String(p.ip).slice(0, 64) : undefined,
    timestamp: new Date().toISOString(),
  })
}

/**
 * @param {{ channel: string, purpose: string, attempt: number }} p
 */
export function logSmsRetry(p) {
  deliveryLog.info({
    event: 'sms_retry',
    channel: String(p.channel),
    purpose: String(p.purpose ?? ''),
    attempt: p.attempt,
    timestamp: new Date().toISOString(),
  })
}

/**
 * @param {{ backend: string, ttlSec: number }} p
 */
export function logSmsCircuitOpen(p) {
  policyLog.info({
    event: 'circuit_breaker_open',
    backend: String(p.backend),
    ttlSec: p.ttlSec,
    timestamp: new Date().toISOString(),
  })
}
