import { isSmsProviderConfigured, sendVerificationCode } from './smsService.js'
import { maskKrMobileForDisplay } from '../utils/maskKrMobile.js'

const RUNNING_IN_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)

function govSignatureOtpSmsMockEnabled() {
  return String(process.env.GOV_SIGNATURE_OTP_SMS_MOCK ?? process.env.CONTRACT_OTP_SMS_MOCK ?? '')
    .trim()
    .toLowerCase() === 'true'
}

/**
 * @param {{ phoneDigits: string, code: string, purpose: string, clientIp?: string }} p
 */
export async function sendGovernmentSignatureSelfSmsOtp(p) {
  const phoneDigits = String(p.phoneDigits ?? '').replace(/\D/g, '')
  const code = String(p.code ?? '')
  const purpose = String(p.purpose ?? 'gov_signature')
  const clientIp = String(p.clientIp ?? '')

  if (!phoneDigits || !/^\d{6}$/.test(code)) {
    return { ok: false, error: 'invalid_send_params' }
  }

  const masked = maskKrMobileForDisplay(phoneDigits)

  if (RUNNING_IN_PRODUCTION && govSignatureOtpSmsMockEnabled()) {
    console.error('[gov signature OTP SMS] mock must not be enabled in production')
    return { ok: false, error: 'sms_mock_forbidden' }
  }

  if (!RUNNING_IN_PRODUCTION && (govSignatureOtpSmsMockEnabled() || !isSmsProviderConfigured())) {
    console.log('[gov signature OTP SMS mock]', { toMasked: masked, purpose })
    console.log('[gov signature OTP SMS mock] dev code (non-production only):', code)
    return { ok: true, mock: true }
  }

  if (RUNNING_IN_PRODUCTION && !isSmsProviderConfigured()) {
    console.error('[gov signature OTP SMS] provider not configured in production')
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
