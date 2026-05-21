/** 정부지원 전자서명 OTP 설정 — GOV env 우선, develop 호환용 CONTRACT fallback. */
import {
  getContractOtpExpiresSeconds,
  getContractOtpMaxAttempts,
  getContractOtpMaxSendsPerSession,
  getContractOtpResendCooldownSeconds,
  isRunningInProduction,
} from './contractOtpConfig.js'
import { isGovernmentRailwayDevelop } from './smsDebugExposure.js'

const RUNNING_IN_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)

function intEnv(name, fallback) {
  const n = Number(process.env[name])
  if (!Number.isFinite(n) || n < 0) {
    return fallback
  }
  return n
}

export function getGovernmentSignatureOtpExpiresSeconds() {
  return intEnv('GOV_SIGNATURE_OTP_EXPIRES_SECONDS', getContractOtpExpiresSeconds())
}

export function getGovernmentSignatureOtpResendCooldownSeconds() {
  return intEnv('GOV_SIGNATURE_OTP_RESEND_COOLDOWN_SECONDS', getContractOtpResendCooldownSeconds())
}

export function getGovernmentSignatureOtpMaxAttempts() {
  return intEnv('GOV_SIGNATURE_OTP_MAX_ATTEMPTS', getContractOtpMaxAttempts())
}

export function getGovernmentSignatureOtpMaxSendsPerSession() {
  return intEnv('GOV_SIGNATURE_OTP_MAX_SENDS_PER_SESSION', getContractOtpMaxSendsPerSession())
}

/** OTP hash pepper — GOV_SIGNATURE_OTP_PEPPER 우선, 없으면 CONTRACT_OTP_PEPPER */
export function getGovernmentSignatureOtpPepper() {
  const p = String(
    process.env.GOV_SIGNATURE_OTP_PEPPER ?? process.env.CONTRACT_OTP_PEPPER ?? '',
  ).trim()
  if (RUNNING_IN_PRODUCTION) {
    if (p.length < 16) {
      if (isGovernmentRailwayDevelop()) {
        return 'dev-gov-signature-otp-pepper-railway-develop-only'
      }
      throw new Error(
        '[gov signature OTP] GOV_SIGNATURE_OTP_PEPPER must be set (min 16 chars) in production',
      )
    }
    return p
  }
  if (p.length >= 16) {
    return p
  }
  return 'dev-gov-signature-otp-pepper-min-16-chars-local-only'
}

export { isRunningInProduction }
