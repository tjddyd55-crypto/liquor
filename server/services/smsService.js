import axios from 'axios'
import { logSmsDelivery, logSmsRetry } from './smsStructuredLog.js'
import { SMS_PUBLIC_DELAY_MESSAGE } from './smsPublicMessages.js'
import {
  assertSmsCircuitClosed,
  recordSmsSendFailure,
  recordSmsSendSuccess,
} from './smsCircuitBreaker.js'

const ALIGO_API_KEY = process.env.ALIGO_API_KEY
const ALIGO_USER_ID = process.env.ALIGO_USER_ID
const ALIGO_SENDER = process.env.ALIGO_SENDER

/** 설정 시 JSON `{ phone, message }` POST로 전송 (예: EC2 중계 서버). Aligo·테스트모드보다 우선 */
const SMS_HTTP_GATEWAY_URL = String(process.env.SMS_HTTP_GATEWAY_URL ?? '').trim()

const ALIGO_URL = 'https://apis.aligo.in/send/'

const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)

const SMS_GATEWAY_HEALTH_CHECK =
  String(process.env.SMS_GATEWAY_HEALTH_CHECK ?? '').trim().toLowerCase() === 'true'

const HEALTH_CHECK_TIMEOUT_MS = (() => {
  const n = Number(process.env.SMS_GATEWAY_HEALTH_TIMEOUT_MS ?? 2000)
  return Number.isFinite(n) && n >= 500 ? Math.min(n, 5000) : 2000
})()

/** 3~5초 권장 — env로 덮어쓰기 가능 */
const SMS_SEND_TIMEOUT_MS = (() => {
  const n = Number(process.env.SMS_SEND_TIMEOUT_MS ?? 5000)
  if (!Number.isFinite(n) || n < 3000) {
    return 5000
  }
  return Math.min(n, 8000)
})()

const RETRY_DELAY_MS = 400

function maskPhone(phoneDigits) {
  const d = String(phoneDigits ?? '').replace(/\D/g, '')
  if (d.length < 4) {
    return '***'
  }
  return `***${d.slice(-4)}`
}

/** env 플래그를 true 로 해석한다. 참으로 명시된 값만 true, 그 외·공백·미설정은 false */
function normalizeBooleanEnv(raw) {
  const s = String(raw ?? '')
    .trim()
    .toUpperCase()
  return s === '1' || s === 'TRUE' || s === 'YES' || s === 'Y' || s === 'ON' || s === 'T'
}

function normalizePhoneNumber(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function isDevelopmentDeploy() {
  const appEnv = String(process.env.APP_ENV ?? '').trim().toLowerCase()
  if (appEnv === 'development') {
    return true
  }
  const rail = String(process.env.RAILWAY_ENVIRONMENT_NAME ?? '').trim().toLowerCase()
  return rail === 'development'
}

/** TEST_RECIPIENTS: 공백/쉼표/세미콜론/파이프/줄바꿈으로 구분된 수신 테스트 번호(숫자만 정규화) */
function getAllowedTestRecipients() {
  const raw = String(process.env.TEST_RECIPIENTS ?? '')
  const seen = new Set()
  const parts = raw.split(/[\s,;|\n\r]+/).filter(Boolean)
  for (const p of parts) {
    const d = normalizePhoneNumber(p)
    if (d.length > 0) {
      seen.add(d)
    }
  }
  return seen
}

/**
 * 발송 허용 정책 (development 전용 차단만 반환값에 반영한다).
 * production 은 `{ kind:'production' }` 로 기존 gateway/알리고 순서 유지.
 * @returns {{ kind: 'production' } | { kind: 'mock', reason: string } | { kind: 'allow_real_test_recipient' }}
 */
function resolveSmsSendPolicy(receiverDigits) {
  if (!isDevelopmentDeploy()) {
    return { kind: 'production' }
  }
  if (normalizeBooleanEnv(process.env.DISABLE_REAL_SEND)) {
    return { kind: 'mock', reason: 'real_send_disabled' }
  }
  if (!normalizeBooleanEnv(process.env.ALLOW_TEST_RECIPIENTS_ONLY)) {
    return { kind: 'mock', reason: 'allowlist_disabled' }
  }
  const allowed = getAllowedTestRecipients()
  if (allowed.size === 0) {
    return { kind: 'mock', reason: 'no_test_recipients' }
  }
  if (!allowed.has(receiverDigits)) {
    return { kind: 'mock', reason: 'recipient_not_allowed' }
  }
  return { kind: 'allow_real_test_recipient' }
}

/** Y/true/1/yes/on/t — 알리고 테스트·비발송 분기 및 testmode 파라미터 근거 */
function isAligoTestModeOn() {
  const raw = String(process.env.ALIGO_TEST_MODE ?? 'Y').trim()
  const effective = raw === '' ? 'Y' : raw
  const u = effective.toUpperCase()
  return u === 'Y' || u === 'TRUE' || u === 'T' || u === '1' || u === 'YES' || u === 'ON'
}

/** 실제 알리고 POST 시 testmode_yn — 비테스트 분기에서는 N 고정으로 전송 신호 명확화 */
function aligoFormTestmodeYn() {
  return isAligoTestModeOn() ? 'Y' : 'N'
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function resolveGatewayHealthUrl() {
  const explicit = String(process.env.SMS_HTTP_GATEWAY_HEALTH_URL ?? '').trim()
  if (explicit) {
    return explicit
  }
  if (!SMS_HTTP_GATEWAY_URL) {
    return null
  }
  try {
    const u = new URL(SMS_HTTP_GATEWAY_URL)
    return `${u.origin}/health`
  } catch {
    return null
  }
}

async function checkSmsGatewayHealth() {
  if (!SMS_GATEWAY_HEALTH_CHECK) {
    return { ok: true }
  }
  const url = resolveGatewayHealthUrl()
  if (!url) {
    return { ok: true }
  }
  try {
    const res = await axios.get(url, {
      timeout: HEALTH_CHECK_TIMEOUT_MS,
      validateStatus: () => true,
    })
    if (res.status >= 200 && res.status < 300) {
      const st = res.data?.status
      if (st === undefined || String(st).toLowerCase() === 'ok') {
        return { ok: true }
      }
    }
    return { ok: false }
  } catch {
    return { ok: false }
  }
}

export function isSmsProviderConfigured() {
  if (SMS_HTTP_GATEWAY_URL) {
    return true
  }
  return Boolean(
    String(ALIGO_API_KEY ?? '').trim() &&
      String(ALIGO_USER_ID ?? '').trim() &&
      String(ALIGO_SENDER ?? '').trim(),
  )
}

/**
 * @param {{ phoneNumber: string, code: string, purpose: string, clientIp?: string }} params
 * @returns {Promise<{ success: boolean, ok?: boolean, sent?: boolean, test?: boolean, testRecipient?: boolean, mocked?: boolean, skipped?: boolean, reason?: string, data?: unknown, error?: unknown, publicMessage?: string, retryAfterSec?: number }>}
 */
export async function sendVerificationCode({ phoneNumber, code, purpose, clientIp = '' }) {
  const receiver = normalizePhoneNumber(phoneNumber)
  const purposeNorm = String(purpose ?? '')
  const messageGateway = `인증번호는 ${code} 입니다.`
  const messageAligo = `[인증번호] ${code} (3분 이내 입력해주세요)`
  const ip = String(clientIp ?? '').trim()

  const finalizeFail = async (status, channel) => {
    logSmsDelivery({
      phone: receiver,
      ip,
      status,
      purpose: purposeNorm,
      channel,
    })
    await recordSmsSendFailure()
  }
  const finalizeOk = async (channel) => {
    logSmsDelivery({
      phone: receiver,
      ip,
      status: 'ok',
      purpose: purposeNorm,
      channel,
    })
    await recordSmsSendSuccess()
  }

  const circuit = await assertSmsCircuitClosed()
  if (!circuit.allowed) {
    logSmsDelivery({
      phone: receiver,
      ip,
      status: 'circuit_open',
      purpose: purposeNorm,
      channel: 'policy',
    })
    return {
      success: false,
      sent: false,
      publicMessage: SMS_PUBLIC_DELAY_MESSAGE,
      retryAfterSec: circuit.retryAfterSec,
    }
  }

  const smsPolicy = resolveSmsSendPolicy(receiver)
  /** development 화이트리스트로 실외부 발송이 허용된 경우 성공 응답에 testRecipient 플래그를 붙인다 */
  let devApprovedTestRecipient = false
  const realDispatchOk = (base) => {
    const out = { ok: true, success: true, mocked: false, ...base }
    if (devApprovedTestRecipient === true && out.sent === true) {
      out.testRecipient = true
    }
    return out
  }

  if (smsPolicy.kind === 'mock') {
    logSmsDelivery({
      phone: receiver,
      ip,
      status: smsPolicy.reason,
      purpose: purposeNorm,
      channel: 'policy',
    })
    console.log('[SMS] mock success (development policy)', {
      to: maskPhone(receiver),
      purpose: purposeNorm,
      reason: smsPolicy.reason,
    })
    return {
      ok: true,
      success: true,
      sent: false,
      test: true,
      mocked: true,
      skipped: true,
      reason: smsPolicy.reason,
    }
  }

  if (smsPolicy.kind === 'allow_real_test_recipient') {
    devApprovedTestRecipient = true
  }

  if (SMS_HTTP_GATEWAY_URL) {
    if (SMS_GATEWAY_HEALTH_CHECK) {
      const h = await checkSmsGatewayHealth()
      if (!h.ok) {
        await finalizeFail('gateway_health_fail', 'http')
        return { success: false, sent: false, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
      }
    }

    const runOnce = () =>
      axios.post(
        SMS_HTTP_GATEWAY_URL,
        { phone: receiver, message: messageGateway },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: SMS_SEND_TIMEOUT_MS,
          validateStatus: () => true,
        },
      )

    let response
    try {
      response = await runOnce()
    } catch (err) {
      await sleep(RETRY_DELAY_MS)
      logSmsRetry({ channel: 'http', purpose: purposeNorm, attempt: 2 })
      try {
        response = await runOnce()
      } catch (err2) {
        await finalizeFail('gateway_error', 'http')
        return { success: false, sent: false, error: err2, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
      }
    }

    if (response.status >= 200 && response.status < 300) {
      await finalizeOk('http')
      return realDispatchOk({ sent: true, data: response.data })
    }

    await sleep(RETRY_DELAY_MS)
    logSmsRetry({ channel: 'http', purpose: purposeNorm, attempt: 2 })
    try {
      response = await runOnce()
    } catch (err) {
      await finalizeFail('gateway_error', 'http')
      return { success: false, sent: false, error: err, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
    }

    if (response.status >= 200 && response.status < 300) {
      await finalizeOk('http_retry')
      return realDispatchOk({ sent: true, data: response.data })
    }

    await finalizeFail('gateway_reject', 'http')
    return { success: false, sent: false, data: response.data, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
  }

  /**
   * ALIGO_TEST_MODE 가 Y/true/1 등이면 이 분기에서 실제 apis.aligo.in 호출을 하지 않는다(운영 검증 단계 포함).
   * development 에서 ALLOW_TEST_RECIPIENTS 로 실수신 테스트를 할 때에는 ALIGO_TEST_MODE=N(또는 비활성)으로 두고,
   * 아래 gateway 미설치 시 알리고 실호출까지 이어지게 한다.
   */
  if (isAligoTestModeOn()) {
    await finalizeOk('test_mode')
    if (IS_PRODUCTION) {
      console.log('[SMS TEST MODE] production — not sent', {
        to: maskPhone(receiver),
        purpose: purposeNorm,
      })
    } else {
      console.log('[SMS TEST MODE] not sent', { to: maskPhone(receiver), purpose: purposeNorm })
    }
    return { success: true, test: true, sent: true }
  }

  if (!isSmsProviderConfigured()) {
    await finalizeFail('provider_unconfigured', 'aligo')
    console.warn('[smsService] SMS provider not configured (gateway URL or Aligo env)')
    return { success: false, sent: false, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
  }

  const runAligo = () => {
    const body = new URLSearchParams({
      key: String(ALIGO_API_KEY),
      user_id: String(ALIGO_USER_ID),
      sender: String(ALIGO_SENDER),
      receiver,
      msg: messageAligo,
      testmode_yn: aligoFormTestmodeYn(),
    })
    return axios.post(ALIGO_URL, body.toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      maxBodyLength: Infinity,
      timeout: SMS_SEND_TIMEOUT_MS,
    })
  }

  const fetchAligoData = async () => {
    const response = await runAligo()
    return response.data
  }

  try {
    let data = await fetchAligoData()
    if (String(data?.result_code) !== '1') {
      await sleep(RETRY_DELAY_MS)
      logSmsRetry({ channel: 'aligo', purpose: purposeNorm, attempt: 2 })
      data = await fetchAligoData()
    }
    if (String(data?.result_code) !== '1') {
      await finalizeFail('aligo_reject', 'aligo')
      console.error('[smsService] SMS send failed:', {
        result_code: data?.result_code,
        purpose: purposeNorm,
        to: maskPhone(receiver),
      })
      return { success: false, sent: false, data, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
    }
    await finalizeOk('aligo')
    return realDispatchOk({ sent: true, data })
  } catch (error) {
    try {
      await sleep(RETRY_DELAY_MS)
      logSmsRetry({ channel: 'aligo', purpose: purposeNorm, attempt: 2 })
      const data = await fetchAligoData()
      if (String(data?.result_code) === '1') {
        await finalizeOk('aligo_retry')
        return realDispatchOk({ sent: true, data })
      }
      await finalizeFail('aligo_reject', 'aligo')
      return { success: false, sent: false, data, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
    } catch (err2) {
      await finalizeFail('aligo_error', 'aligo')
      const msg = err2 instanceof Error ? err2.message : String(err2)
      console.error('[smsService] SMS API error:', msg)
      return { success: false, sent: false, error: err2, publicMessage: SMS_PUBLIC_DELAY_MESSAGE }
    }
  }
}
