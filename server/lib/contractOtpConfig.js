const RUNNING_IN_PRODUCTION =
  process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)

function intEnv(name, fallback) {
  const n = Number(process.env[name])
  if (!Number.isFinite(n) || n < 0) {
    return fallback
  }
  return n
}

export function getContractOtpExpiresSeconds() {
  return intEnv('CONTRACT_OTP_EXPIRES_SECONDS', 300)
}

export function getContractOtpResendCooldownSeconds() {
  return intEnv('CONTRACT_OTP_RESEND_COOLDOWN_SECONDS', 60)
}

export function getContractOtpMaxAttempts() {
  return intEnv('CONTRACT_OTP_MAX_ATTEMPTS', 5)
}

export function getContractOtpMaxSendsPerSession() {
  return intEnv('CONTRACT_OTP_MAX_SENDS_PER_SESSION', 10)
}

/** OTP hash pepper — 운영 필수 */
export function getContractOtpPepper() {
  const p = String(process.env.CONTRACT_OTP_PEPPER ?? '').trim()
  if (RUNNING_IN_PRODUCTION) {
    if (p.length < 16) {
      throw new Error('[contract OTP] CONTRACT_OTP_PEPPER must be set (min 16 chars) in production')
    }
    return p
  }
  if (p.length >= 16) {
    return p
  }
  return 'dev-contract-otp-pepper-min-16-chars-local-only'
}

export function isRunningInProduction() {
  return RUNNING_IN_PRODUCTION
}
