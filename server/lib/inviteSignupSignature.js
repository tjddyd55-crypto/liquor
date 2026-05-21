import { createHmac, timingSafeEqual } from 'node:crypto'

/** 초대 링크 서명 스킴 버전(메시지 포맷 변경 시 증가) */
const SIG_VERSION = 'v1'

/** 초대 링크 유효 기간(밀리초) — 기본 7일 */
export const INVITE_SIGNUP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * @param {string} gaCodeNormalized normalizeInviteCode 통과한 대문자 코드
 * @param {string} refUserId 초대자 users.id
 * @param {number} tsMs 링크 발급 시각(밀리초)
 */
export function canonicalInviteSignupMessage(gaCodeNormalized, refUserId, tsMs) {
  return `${SIG_VERSION}|${gaCodeNormalized}|${String(refUserId).trim()}|${tsMs}`
}

function hmacBuffer(secret, gaCodeNormalized, refUserId, tsMs) {
  const key = String(secret ?? '')
  if (!key) {
    throw new Error('invite_signup_missing_secret')
  }
  const msg = canonicalInviteSignupMessage(gaCodeNormalized, refUserId, tsMs)
  return createHmac('sha256', key).update(msg, 'utf8').digest()
}

/**
 * @param {string} secret HMAC 키
 * @returns {string} base64url
 */
export function signInviteSignup(secret, gaCodeNormalized, refUserId, tsMs) {
  return hmacBuffer(secret, gaCodeNormalized, refUserId, tsMs).toString('base64url')
}

/**
 * @param {string} secret
 * @param {object} p
 * @param {string} p.gaCodeNormalized
 * @param {string} p.refUserId
 * @param {number} p.tsMs
 * @param {string} p.sig base64url
 * @param {number} [p.nowMs]
 */
export function verifyInviteSignupSignature(secret, { gaCodeNormalized, refUserId, tsMs, sig, nowMs = Date.now() }) {
  const sigRaw = String(sig ?? '').trim()
  if (!sigRaw || !gaCodeNormalized || !String(refUserId ?? '').trim()) {
    return { ok: false, reason: 'incomplete' }
  }
  const ts = Number(tsMs)
  if (!Number.isFinite(ts) || ts < 1) {
    return { ok: false, reason: 'ts_invalid' }
  }
  if (ts > nowMs + 120_000) {
    return { ok: false, reason: 'ts_future' }
  }
  if (nowMs - ts > INVITE_SIGNUP_MAX_AGE_MS) {
    return { ok: false, reason: 'expired' }
  }
  let expectedBuf
  try {
    expectedBuf = hmacBuffer(secret, gaCodeNormalized, String(refUserId).trim(), ts)
  } catch {
    return { ok: false, reason: 'secret' }
  }
  let sigBuf
  try {
    sigBuf = Buffer.from(sigRaw, 'base64url')
  } catch {
    return { ok: false, reason: 'sig_format' }
  }
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return { ok: false, reason: 'sig_mismatch' }
  }
  return { ok: true }
}
