/**
 * develop 전용 government HTTP E2E 공통 설정·가드.
 * secret·비밀번호는 커밋하지 않는다.
 * E2E_GOVERNMENT_PASSWORD는 선택(없으면 signature E2E가 HTTP 가입으로 self-seed).
 */

/** CRM-government Railway develop app (고정 SSOT) */
export const DEVELOP_DEFAULT_BASE_URL = 'https://app-develop-9663.up.railway.app'

/** production/main·보험 CRM 호스트 차단 패턴 (소문자 비교) */
const BLOCKED_HOST_SNIPPETS = [
  'insurance-production',
  'insurance-production-7bd8',
  'insurance-main',
]

/**
 * @param {string} baseUrl
 */
export function assertDevelopHttpTarget(baseUrl) {
  if (process.env.E2E_GOVERNMENT_ALLOW_NON_DEVELOP === '1') {
    console.warn('[e2e] E2E_GOVERNMENT_ALLOW_NON_DEVELOP=1 — develop 가드 우회 (로컬 디버그 전용)')
    return
  }
  let host = ''
  try {
    host = new URL(baseUrl.replace(/\/$/, '')).hostname.toLowerCase()
  } catch {
    throw new Error(`E2E blocked: invalid E2E_BASE_URL (${baseUrl})`)
  }
  for (const snippet of BLOCKED_HOST_SNIPPETS) {
    if (host.includes(snippet)) {
      throw new Error(
        `E2E blocked: ${host} looks like production. HTTP E2E는 develop(${DEVELOP_DEFAULT_BASE_URL})만 허용.`,
      )
    }
  }
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  const isDevelopRailway = host === 'app-develop-9663.up.railway.app' || host.includes('app-develop')
  if (!isLocal && !isDevelopRailway) {
    throw new Error(
      `E2E blocked: ${host} is not the known develop host. Set E2E_BASE_URL=${DEVELOP_DEFAULT_BASE_URL} or use localhost for local dev.`,
    )
  }
}

/**
 * develop DB 직접 접근 스크립트(seed/reset)용 가드.
 */
export function assertDevelopDbTarget() {
  if (process.env.E2E_GOVERNMENT_ALLOW_NON_DEVELOP === '1') {
    console.warn('[e2e] E2E_GOVERNMENT_ALLOW_NON_DEVELOP=1 — DB develop 가드 우회')
    return
  }
  const dbUrl = String(process.env.DATABASE_URL ?? '').toLowerCase()
  if (!dbUrl) {
    throw new Error(
      'E2E blocked: DATABASE_URL missing. DB 스크립트는 `railway run -e develop -s app` 등 develop DB에서만 실행.',
    )
  }
  for (const snippet of BLOCKED_HOST_SNIPPETS) {
    if (dbUrl.includes(snippet)) {
      throw new Error('E2E blocked: DATABASE_URL looks like production/main insurance DB.')
    }
  }
  if (process.env.RAILWAY_ENVIRONMENT_NAME === 'production') {
    throw new Error('E2E blocked: RAILWAY_ENVIRONMENT_NAME=production')
  }
}

export function resolveOptionalE2ePassword() {
  return String(process.env.E2E_GOVERNMENT_PASSWORD ?? '').trim()
}

export function resolveE2eGovernmentHttpConfig(options = {}) {
  const { requirePassword = false } = options
  const base = String(process.env.E2E_BASE_URL ?? DEVELOP_DEFAULT_BASE_URL).replace(/\/$/, '')
  assertDevelopHttpTarget(base)
  const password = resolveOptionalE2ePassword()
  if (requirePassword && !password) {
    throw new Error(
      'E2E_GOVERNMENT_PASSWORD is required. develop 테스트 계정 비밀번호를 환경변수로만 주입 (커밋·로그 금지).',
    )
  }
  return {
    base,
    api: `${base}/backend/api`,
    password,
    hasPassword: password.length > 0,
    adminLoginId: String(
      process.env.E2E_GOVERNMENT_ADMIN_LOGIN_ID ?? process.env.GOVERNMENT_ADMIN_LOGIN_ID ?? 'admin',
    ).trim(),
    programUserA: String(process.env.E2E_GOVERNMENT_USER_A ?? 'e2e_ua_dev').trim(),
    programUserB: String(process.env.E2E_GOVERNMENT_USER_B ?? 'e2e_ub_dev').trim(),
  }
}

export function createE2eReporter() {
  /** @type {{ ok: boolean; name: string; detail?: string }[]} */
  const results = []
  let failed = 0
  return {
    results,
    pass(name, detail = '') {
      results.push({ ok: true, name, detail })
      console.log(`[PASS] ${name}${detail ? ` — ${detail}` : ''}`)
    },
    fail(name, detail = '') {
      failed += 1
      results.push({ ok: false, name, detail })
      console.log(`[FAIL] ${name}${detail ? ` — ${detail}` : ''}`)
    },
    summary() {
      const passed = results.filter((r) => r.ok).length
      console.log(`\n--- SUMMARY passed=${passed} failed=${failed} ---`)
      return failed
    },
  }
}

/**
 * @param {string} apiBase
 * @param {string} path
 * @param {{ token?: string; method?: string; body?: unknown; expectStatus?: number }} [opts]
 */
export async function e2eApi(apiBase, path, opts = {}) {
  const { token, method = 'GET', body, expectStatus } = opts
  const headers = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body != null) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  if (expectStatus != null && res.status !== expectStatus) {
    if (expectStatus === 200 && res.status === 201) {
      // created
    } else {
      throw new Error(`${method} ${path} expected ${expectStatus} got ${res.status}: ${text.slice(0, 180)}`)
    }
  }
  return { status: res.status, json }
}

/**
 * @param {string} apiBase
 * @param {string} username
 * @param {string} password
 */
export async function e2eLogin(apiBase, username, password) {
  const { json } = await e2eApi(apiBase, '/auth/login', {
    method: 'POST',
    body: { username, password },
    expectStatus: 200,
  })
  if (!json?.token) throw new Error(`login failed for ${username}`)
  return json.token
}

export function requireE2ePasswordFromEnv() {
  const password = String(process.env.E2E_GOVERNMENT_PASSWORD ?? '').trim()
  if (!password) {
    throw new Error('E2E_GOVERNMENT_PASSWORD is required (develop only; do not commit).')
  }
  return password
}
