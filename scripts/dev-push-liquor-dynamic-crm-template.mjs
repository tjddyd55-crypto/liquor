#!/usr/bin/env node
/**
 * 슈퍼관리 세션으로 dev/prod 같은-origin API에 주류 동적 고객 템플릿을 생성·(선택) 테넌트 연결합니다.
 *
 * 인증 우선순위 (로컬 환경변수만 사용, 파일·커밋 저장 금지):
 * 1) INSURANCE_DEV_ADMIN_JWT — Bearer 토큰
 * 2) INSURANCE_DEV_ADMIN_USERNAME + INSURANCE_DEV_ADMIN_PASSWORD — POST /backend/auth/login
 * 둘 다 없으면 안내 후 종료.
 *
 * 로그인 API는 서버 apiRouter 및 프론트 authApi 와 동일하게 `POST /auth/login`(베이스는 `<origin>/backend`) 본문 `{ username, password }`, 성공 시 최상위 `token` 필드.
 *
 * 사용:
 *   $env:INSURANCE_DEV_ADMIN_JWT="..."   # 또는 아래 username/password
 *   $env:INSURANCE_DEV_ADMIN_USERNAME="..."
 *   $env:INSURANCE_DEV_ADMIN_PASSWORD="..."
 *   node scripts/dev-push-liquor-dynamic-crm-template.mjs https://insurance-dev.up.railway.app [--tenant=id] [--force-new]
 *
 * 기본 동작: 같은 industry_code 에 동일 이름(주류회사 고객관리 템플릿)의 active 행이 있으면 POST 하지 않고 그 id 로 종료합니다.
 * --force-new 가 있으면 항상 POST 로 신규 행을 추가합니다.
 */

import process from 'node:process'

const origin = process.argv[2]?.replace(/\/$/, '')

const tenantFlag = process.argv.find((x) => x.startsWith('--tenant='))
const tenantId = tenantFlag ? Number(tenantFlag.slice('--tenant='.length).trim()) : NaN
const forceNew = process.argv.includes('--force-new')

if (!origin?.startsWith('http')) {
  console.error('사용법: node scripts/dev-push-liquor-dynamic-crm-template.mjs <origin> [--tenant=id]')
  console.error('  예: https://insurance-dev.up.railway.app')
  process.exit(1)
}

const base = `${origin.replace(/\/$/, '')}/backend`

/**
 * 로그인 응답에서 토큰만 추출. 전체 바디나 헤더는 출력하지 않음.
 * @param {unknown} json
 */
function extractBearerFromLoginPayload(json) {
  if (!json || typeof json !== 'object') return ''
  const o = /** @type {Record<string, unknown>} */ (json)
  const cand = [o.token, o.accessToken, o.access_token]
  for (const c of cand) {
    if (typeof c === 'string' && c.trim()) return c.trim()
  }
  return ''
}

/** @returns {boolean} */
function isSuperAdminFromLoginPayload(json) {
  if (!json || typeof json !== 'object') return false
  const role = /** @type {Record<string, unknown>} */ (json).user?.role
  return String(role ?? '').trim().toUpperCase() === 'SUPER_ADMIN'
}

/**
 * @param {string} username
 * @param {string} password
 */
async function obtainTokenViaLogin(username, password) {
  const url = `${base}/auth/login`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const text = await res.text()
  /** @type {unknown} */
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  if (!res.ok) {
    const msg =
      json && typeof json === 'object' && typeof json.message === 'string' && json.message.trim()
        ? json.message.trim()
        : res.statusText
    const err = new Error(msg)
    err.name = `Http_${res.status}`
    throw err
  }
  if (!isSuperAdminFromLoginPayload(json)) {
    throw new Error('로그인한 계정이 SUPER_ADMIN 이 아닙니다. 플랫폼 관리자 API에는 슈퍼관리 세션이 필요합니다.')
  }
  const tok = extractBearerFromLoginPayload(json)
  if (!tok) throw new Error('로그인 응답에 token 이 없습니다.')
  return tok
}

/**
 * @returns {Promise<string>}
 */
async function resolveBearerToken() {
  const envJwt = String(process.env.INSURANCE_DEV_ADMIN_JWT ?? '').trim()
  if (envJwt) return envJwt

  const username = String(process.env.INSURANCE_DEV_ADMIN_USERNAME ?? '').trim()
  const password = String(process.env.INSURANCE_DEV_ADMIN_PASSWORD ?? '')
  if (username && password) {
    console.log('로그인 API로 세션 확보 중…')
    return obtainTokenViaLogin(username, password)
  }

  console.error('[안내] 아래 중 하나만 로컬 환경변수로 설정한 뒤 다시 실행하세요.')
  console.error('  · INSURANCE_DEV_ADMIN_JWT')
  console.error('  · INSURANCE_DEV_ADMIN_USERNAME + INSURANCE_DEV_ADMIN_PASSWORD')
  console.error(`  검증 URL: ${origin}/admin/platform/crm-customer-management-templates`)
  process.exit(1)
}

try {
  const token = await resolveBearerToken()

  if (!String(process.env.INSURANCE_DEV_ADMIN_JWT ?? '').trim()) {
    console.log('로그인 성공')
  }

  const fixtureMod = await import('../server/crm/fixtures/liquorCompanyDynamicCrmTemplateBody.js')
  const body = fixtureMod.buildLiquorCompanyDynamicCrmTemplateBody()
  const wantName = String(body.name ?? '').trim()
  const wantIc = String(body.industry_code ?? '').trim().toLowerCase()

  async function fetchJson(url, init) {
    const method = init?.method ?? 'GET'
    const headers = {
      Authorization: `Bearer ${token}`,
      ...(init.headers && typeof init.headers === 'object' ? init.headers : {}),
    }
    const res = await fetch(url, { ...init, headers })
    const text = await res.text()
    let json
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = undefined
    }
    if (!res.ok) {
      const msg =
        json && typeof json === 'object' && json !== null && 'message' in json
          ? String(/** @type {{ message?: unknown }} */ (json).message ?? '')
          : res.statusText
      throw new Error(`${method} failed: HTTP ${res.status} ${msg}`.trim())
    }
    return json
  }

  /** @returns {unknown[]|null} */
  function extractList(payload) {
    const d = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload.data : payload
    return Array.isArray(d) ? d : null
  }

  let id /** @type {number} */

  if (!forceNew) {
    const listUrl = `${base}/admin/platform/crm-customer-management-templates?industry_code=${encodeURIComponent(wantIc)}`
    const listed = await fetchJson(listUrl, { method: 'GET' })
    const rows = extractList(listed) ?? []
    const hit = rows.find((r) => {
      if (!r || typeof r !== 'object') return false
      const o = /** @type {Record<string, unknown>} */ (r)
      const nm = String(o.name ?? '').trim()
      const ic = String(o.industry_code ?? o.industryCode ?? '').trim().toLowerCase()
      const st = String(o.status ?? '').trim().toLowerCase()
      return nm === wantName && ic === wantIc && st === 'active'
    })
    if (hit && typeof hit === 'object') {
      const rawId = /** @type {Record<string, unknown>} */ (hit).id
      const n = typeof rawId === 'number' ? rawId : Number(rawId)
      if (Number.isInteger(n) && n > 0) {
        id = n
        console.log(`기존 활성 템플릿 재사용 · industry_code=${wantIc} · id=${id}`)
      }
    }
  }

  if (id === undefined) {
    const created = await fetchJson(`${base}/admin/platform/crm-customer-management-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const row = created && typeof created === 'object' ? created?.data?.row : null
    const nid = typeof row?.id === 'number' ? row.id : Number(row?.id)
    if (!Number.isInteger(nid) || nid < 1) {
      console.error('응답에 템플릿 id 없음 (POST). 서버 검증 또는 권한을 확인하세요.')
      process.exit(2)
    }
    id = nid
    console.log(`생성 완료 · industry_code=${wantIc} · status=active · id=${id}`)
  }

  if (!(Number.isInteger(id) && id > 0)) {
    console.error('템플릿 id를 결정하지 못했습니다.')
    process.exit(2)
  }

  if (Number.isInteger(tenantId) && tenantId > 0) {
    await fetchJson(`${base}/admin/platform/tenants/${tenantId}/crm-customer-template`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ crm_customer_template_id: id }),
    })
    console.log(`테넌트 CRM 템플릿 연결 완료 · tenant id=${tenantId} · template id=${id}`)
  }

  console.log(`템플릿 요약 페이지: ${origin}/admin/platform/crm-customer-management-templates/${id}/edit`)
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e)
  console.error('실패:', msg)
  process.exit(3)
}
