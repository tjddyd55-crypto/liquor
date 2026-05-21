/**
 * develop HTTP E2E — government_user 자동 가입 (Railway password 변수 불필요).
 * 비밀번호·OTP·debugCode는 로그에 출력하지 않는다.
 */
import { randomBytes, randomInt } from 'node:crypto'
import { e2eApi, e2eLogin } from './e2eGovernmentHttpEnv.mjs'

const DEFAULT_AGENCY_CODES = ['GOVA001', 'GOVB001', 'TEST001']
const INDUSTRY_CODE = 'government'

/**
 * @returns {string}
 */
export function generateE2eSignatureUsername() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ts = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `e2e_sig_${ts}`
}

/**
 * @returns {string}
 */
export function generateE2eRandomPassword() {
  return randomBytes(24).toString('base64url')
}

/**
 * @returns {string}
 */
export function generateE2eUniquePhone() {
  const suffix = String(randomInt(10_000_000, 99_999_999))
  return `010${suffix}`
}

/**
 * @param {string} apiBase
 * @returns {string[]}
 */
function resolveAgencyCodeCandidates() {
  const fromEnv = String(process.env.E2E_GOVERNMENT_AGENCY_CODE ?? '').trim()
  if (fromEnv) return [fromEnv.toUpperCase(), ...DEFAULT_AGENCY_CODES.filter((c) => c !== fromEnv.toUpperCase())]
  return [...DEFAULT_AGENCY_CODES]
}

/**
 * @param {string} apiBase
 * @returns {Promise<{ code: string; tenantName: string } | null>}
 */
export async function findValidAgencyRegistrationCode(apiBase) {
  const tried = []
  for (const code of resolveAgencyCodeCandidates()) {
    tried.push(code)
    const res = await e2eApi(apiBase, '/auth/validate-tenant-registration-code', {
      method: 'POST',
      body: { industry_code: INDUSTRY_CODE, registration_code: code },
    })
    if (res.status === 200 && res.json?.ok === true) {
      return { code, tenantName: String(res.json?.tenantName ?? '').trim() }
    }
  }
  const err = new Error(
    `가입 가능한 기관 코드 없음. 시도: ${tried.join(', ')}. develop DB tenant_registration_codes 확인 필요.`,
  )
  /** @type {Error & { triedCodes?: string[] }} */ (err).triedCodes = tried
  throw err
}

/**
 * @param {string} apiBase
 * @param {{ registrationCode: string; username?: string; phone?: string; displayName?: string }} opts
 * @returns {Promise<{ username: string; password: string; phone: string; registrationCode: string }>}
 */
export async function registerGovernmentProgramUserViaHttp(apiBase, opts) {
  const registrationCode = String(opts.registrationCode ?? '').trim().toUpperCase()
  const username = String(opts.username ?? generateE2eSignatureUsername()).trim()
  const password = generateE2eRandomPassword()
  const phone = String(opts.phone ?? generateE2eUniquePhone()).trim()
  const displayName = String(opts.displayName ?? username).trim()

  const smsSend = await e2eApi(apiBase, '/auth/send-signup-phone-code', {
    method: 'POST',
    body: {
      industry_code: INDUSTRY_CODE,
      registration_code: registrationCode,
      phoneNumber: phone,
    },
  })
  if (smsSend.status !== 200) {
    throw new Error(
      `signup SMS send failed (${registrationCode}): ${smsSend.status} ${smsSend.json?.message ?? ''}`.trim(),
    )
  }

  const smsCode = String(smsSend.json?.debugCode ?? '').trim()
  if (!/^\d{6}$/.test(smsCode)) {
    throw new Error(
      `signup debugCode unavailable (${registrationCode}). develop ALIGO_TEST_MODE=Y + APP_PRODUCT=government 필요.`,
    )
  }

  const smsVerify = await e2eApi(apiBase, '/auth/verify-signup-phone-code', {
    method: 'POST',
    body: {
      industry_code: INDUSTRY_CODE,
      registration_code: registrationCode,
      phoneNumber: phone,
      code: smsCode,
    },
  })
  if (smsVerify.status !== 200 || !smsVerify.json?.signup_phone_proof) {
    throw new Error(`signup phone verify failed: ${smsVerify.status} ${smsVerify.json?.message ?? ''}`.trim())
  }

  const reg = await e2eApi(apiBase, '/auth/register', {
    method: 'POST',
    body: {
      username,
      password,
      display_name: displayName,
      phone_number: phone,
      industry_code: INDUSTRY_CODE,
      registration_code: registrationCode,
      signup_phone_proof: smsVerify.json.signup_phone_proof,
    },
  })
  if (reg.status !== 201) {
    throw new Error(`register failed: ${reg.status} ${reg.json?.message ?? ''}`.trim())
  }

  const token = await e2eLogin(apiBase, username, password)
  const access = await e2eApi(apiBase, '/government-support/me/access', { token })
  if (access.json?.data?.isGovernmentProgramUser !== true) {
    throw new Error(`registered user is not government program user: ${username}`)
  }

  return { username, password, phone, registrationCode }
}

/**
 * @param {string} apiBase
 * @param {string} username
 * @param {string} password
 * @returns {Promise<string | null>}
 */
async function tryLogin(apiBase, username, password) {
  try {
    return await e2eLogin(apiBase, username, password)
  } catch {
    return null
  }
}

/**
 * program user A/B — env 비밀번호·기존 계정 우선, 없으면 HTTP 가입.
 * @param {string} apiBase
 * @param {{ optionalPassword?: string; userA?: string; userB?: string }} cfg
 */
export async function resolveE2eProgramUsers(apiBase, cfg = {}) {
  const optionalPassword = String(cfg.optionalPassword ?? '').trim()
  const userAName = String(cfg.userA ?? process.env.E2E_GOVERNMENT_USER_A ?? 'e2e_ua_dev').trim()
  const userBName = String(cfg.userB ?? process.env.E2E_GOVERNMENT_USER_B ?? 'e2e_ub_dev').trim()

  /** @type {{ username: string; password: string; token: string; seeded: boolean } | null} */
  let userA = null
  /** @type {{ username: string; password: string; token: string; seeded: boolean } | null} */
  let userB = null

  if (optionalPassword) {
    const tokenA = await tryLogin(apiBase, userAName, optionalPassword)
    if (tokenA) {
      userA = { username: userAName, password: optionalPassword, token: tokenA, seeded: false }
    }
    const tokenB = await tryLogin(apiBase, userBName, optionalPassword)
    if (tokenB) {
      userB = { username: userBName, password: optionalPassword, token: tokenB, seeded: false }
    }
  }

  const validCodes = []
  for (const code of resolveAgencyCodeCandidates()) {
    const res = await e2eApi(apiBase, '/auth/validate-tenant-registration-code', {
      method: 'POST',
      body: { industry_code: INDUSTRY_CODE, registration_code: code },
    })
    if (res.status === 200 && res.json?.ok === true) {
      validCodes.push(code)
    }
  }
  if (validCodes.length === 0) {
    throw new Error(
      `가입 가능한 기관 코드 없음. 시도: ${resolveAgencyCodeCandidates().join(', ')}`,
    )
  }

  if (!userA) {
    const reg = await registerGovernmentProgramUserViaHttp(apiBase, {
      registrationCode: validCodes[0],
      username: generateE2eSignatureUsername(),
    })
    userA = {
      username: reg.username,
      password: reg.password,
      phone: reg.phone,
      token: await e2eLogin(apiBase, reg.username, reg.password),
      seeded: true,
    }
  }

  if (!userB) {
    const codeForB = validCodes.length > 1 ? validCodes[1] : validCodes[0]
    const reg = await registerGovernmentProgramUserViaHttp(apiBase, {
      registrationCode: codeForB,
      username: `${generateE2eSignatureUsername()}_b`,
    })
    userB = {
      username: reg.username,
      password: reg.password,
      phone: reg.phone,
      token: await e2eLogin(apiBase, reg.username, reg.password),
      seeded: true,
    }
  }

  return { userA, userB, validAgencyCodes: validCodes }
}

/**
 * industry admin — optionalPassword 있을 때만 시도.
 * @param {string} apiBase
 * @param {{ adminLoginId: string; optionalPassword?: string }} cfg
 */
export async function tryResolveIndustryAdminToken(apiBase, cfg) {
  const password = String(cfg.optionalPassword ?? '').trim()
  if (!password) return null
  return tryLogin(apiBase, cfg.adminLoginId, password)
}
