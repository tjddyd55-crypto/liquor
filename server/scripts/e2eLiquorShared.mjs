/**
 * Liquor develop E2E 공통 HTTP 유틸 (secret 미출력).
 */
import fs from 'node:fs'
import { execSync } from 'node:child_process'

export const AUTH_STORAGE_KEY = 'insurance.auth.session'

export function liquorBaseUrl() {
  return String(process.env.E2E_LIQUOR_BASE_URL ?? 'https://app-develop-a3aa.up.railway.app').replace(/\/$/, '')
}

export function liquorApiBase() {
  return `${liquorBaseUrl()}/backend/api`
}

export function resolveLiquorE2eCredentials() {
  const fromEnvUser =
    process.env.E2E_LIQUOR_LOGIN_ID ??
    process.env.E2E_LIQUOR_MOBILE_USERNAME ??
    ''
  const fromEnvPass =
    process.env.E2E_LIQUOR_PASSWORD ??
    process.env.E2E_LIQUOR_MOBILE_PASSWORD ??
    process.env.E2E_LIQUOR_ADMIN_PASSWORD ??
    process.env.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD ??
    ''

  if (fromEnvUser.trim() && fromEnvPass.trim()) {
    return { username: fromEnvUser.trim(), password: fromEnvPass.trim(), source: 'env' }
  }

  if (fs.existsSync('.e2e-liquor-last-run.json')) {
    try {
      const raw = JSON.parse(fs.readFileSync('.e2e-liquor-last-run.json', 'utf8'))
      if (raw.username && raw.password) {
        return { username: String(raw.username), password: String(raw.password), source: 'last-run' }
      }
    } catch {
      /* ignore */
    }
  }

  return null
}

export async function api(path, { method = 'GET', token, body, formData } = {}) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  let payload
  if (formData) payload = formData
  else if (body != null) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(`${liquorApiBase()}${path}`, { method, headers, body: payload })
  const text = await res.text()
  let json = {}
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    json = { raw: text.slice(0, 200) }
  }
  return { status: res.status, json }
}

export async function login(username, password) {
  const res = await api('/auth/login', { method: 'POST', body: { username, password } })
  const token = res.json?.token ?? res.json?.accessToken ?? null
  return { ...res, token }
}

/** SPA localStorage 세션 (AuthProvider 형식) */
export function buildAuthSession(loginJson) {
  const u = loginJson.user ?? {}
  const rawGa = u.ga_id ?? u.gaId
  const gaId = typeof rawGa === 'number' && rawGa > 0 ? rawGa : Number(rawGa) || 0
  const rawCid = u.company_id ?? u.companyId
  const companyId =
    typeof rawCid === 'number' && Number.isInteger(rawCid) && rawCid > 0 ? rawCid : null
  const crmRaw = u.crm_industry_code ?? u.crmIndustryCode
  const crmIndustryCode =
    crmRaw == null ? null : typeof crmRaw === 'string' && crmRaw.trim() ? crmRaw.trim() : String(crmRaw).trim()

  return {
    token: loginJson.token,
    user: {
      id: String(u.id),
      username: String(u.username ?? ''),
      role: u.role,
      gaId,
      gaCode: typeof (u.ga_code ?? u.gaCode) === 'string' ? String(u.ga_code ?? u.gaCode).trim().toUpperCase() : '',
      gaName: typeof (u.ga_name ?? u.gaName) === 'string' ? String(u.ga_name ?? u.gaName).trim() : '',
      companyId: u.role === 'INSURER_MANAGER' ? companyId : null,
      displayName:
        typeof (u.display_name ?? u.displayName) === 'string' && String(u.display_name ?? u.displayName).trim()
          ? String(u.display_name ?? u.displayName).trim()
          : String(u.username ?? '').trim(),
      teamId:
        typeof (u.team_id ?? u.teamId) === 'string' && String(u.team_id ?? u.teamId).trim()
          ? String(u.team_id ?? u.teamId).trim()
          : null,
      subscription: u.subscription ?? undefined,
      crmIndustryCode: crmIndustryCode || null,
      tenantCrm: u.tenant_crm ?? u.tenantCrm ?? null,
    },
  }
}

export async function pickCustomerId(token) {
  const res = await api('/customers', { token })
  const rows = res.json?.customers ?? res.json?.data ?? res.json?.items ?? []
  if (!Array.isArray(rows) || rows.length === 0) return null

  for (const row of rows.slice(0, 30)) {
    const id = Number(row.id ?? row.customerId)
    if (!Number.isFinite(id) || id <= 0) continue
    const detail = await api(`/liquor/customers/${id}/detail`, { token })
    if (detail.status === 200) return id
  }
  return null
}

/** 사용자 화면(body text)에 노출되면 안 되는 개발용 문구 */
export const LIQUOR_FORBIDDEN_UI_TERMS = [
  'mock OTP',
  '테스트 절차',
  'evidenceHash',
  'generated_document',
  'uploaded_pdf',
  'source_type',
  'document_kind',
  'entityType',
  'linkTarget',
  'TODO',
  '준비 중',
  'placeholder(선택)',
  'fieldKey(읽기 전용)',
  '전자문서 (준비 중)',
  'API 연동 예정',
  'stub',
  'disabled action',
  'placeholder',
]

export function scanForbiddenUiText(bodyText) {
  const text = String(bodyText ?? '')
  const hits = []
  for (const term of LIQUOR_FORBIDDEN_UI_TERMS) {
    if (term === 'placeholder') {
      if (/\bplaceholder\b/i.test(text)) hits.push(term)
    } else if (text.includes(term)) {
      hits.push(term)
    }
  }
  return [...new Set(hits)]
}

export function getGitCommitHash() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return '(unknown)'
  }
}
