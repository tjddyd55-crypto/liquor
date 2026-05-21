import { isSmsProviderConfigured, sendVerificationCode } from './smsService.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'

const RUNNING_IN_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)

function contractOtpSmsMockEnabled() {
  return String(process.env.CONTRACT_OTP_SMS_MOCK ?? '').trim().toLowerCase() === 'true'
}

/**
 * 계약서 지정번호 OTP 문자 발송.
 * - 운영: mock 금지. 기존 smsService(알리고/HTTP 게이트웨이) 사용.
 * - 비운영: CONTRACT_OTP_SMS_MOCK=true 또는 프로바이더 미설정 시 마스킹 번호 + OTP만 로그(운영에서는 절대 원문 로그 없음).
 *
 * @param {{ phoneDigits: string, code: string, purpose: string, clientIp?: string }} p
 * @returns {Promise<{ ok: boolean, mock?: boolean, error?: string }>}
 */
export async function sendContractSelfSmsOtp(p) {
  const phoneDigits = String(p.phoneDigits ?? '').replace(/\D/g, '')
  const code = String(p.code ?? '')
  const purpose = String(p.purpose ?? 'contract_signature')
  const clientIp = String(p.clientIp ?? '')

  if (!phoneDigits || !/^\d{6}$/.test(code)) {
    return { ok: false, error: 'invalid_send_params' }
  }

  const masked = maskKrMobileForDisplay(phoneDigits)

  if (RUNNING_IN_PRODUCTION && contractOtpSmsMockEnabled()) {
    console.error('[contract OTP SMS] CONTRACT_OTP_SMS_MOCK must not be enabled in production')
    return { ok: false, error: 'sms_mock_forbidden' }
  }

  if (!RUNNING_IN_PRODUCTION && (contractOtpSmsMockEnabled() || !isSmsProviderConfigured())) {
    console.log('[contract OTP SMS mock]', { toMasked: masked, expiresHint: 'see CONTRACT_OTP_EXPIRES_SECONDS', purpose })
    console.log('[contract OTP SMS mock] dev code (non-production only):', code)
    return { ok: true, mock: true }
  }

  if (RUNNING_IN_PRODUCTION && !isSmsProviderConfigured()) {
    console.error('[contract OTP SMS] provider not configured in production')
    return { ok: false, error: 'sms_provider_unconfigured' }
  }

  const res = await sendVerificationCode({
    phoneNumber: phoneDigits,
    code,
    purpose,
    clientIp,
  })
  if (!res.success) {
    return { ok: false, error: 'sms_send_failed' }
  }
  return { ok: true, mock: Boolean(res.test) }
}
