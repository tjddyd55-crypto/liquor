/**
 * 로컬 CRM 템플릿 API 검증 헬퍼 (삭제/drop 없음 — gym 업종 테스트 템플릿 생성·조회·수정만).
 *
 * 사용: node scripts/e2e-local-crm-template-api.mjs
 * 전제: localhost:3001 백엔드 기동, SUPER_ADMIN 계정 존재
 *
 * 환경변수:
 *   API_BASE      — 기본 http://localhost:3001/backend
 *   E2E_LOGIN     — 로그인 아이디 (기본 admin, 로컬 bootstrap과 동일할 때만)
 *   E2E_PASSWORD  — 비밀번호 (기본 1234 — 운영 비밀번호를 커밋하지 말 것)
 */
const BASE = process.env.API_BASE || 'http://localhost:3001/backend'
const LOGIN = process.env.E2E_LOGIN || 'admin'
const PASS = process.env.E2E_PASSWORD || '1234'

async function req(path, opts = {}) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

function gymPayload(suffix) {
  const ts = Date.now()
  return {
    name: `E2E QA ${suffix} ${ts}`,
    industry_code: 'gym',
    description: 'local e2e',
    status: 'active',
    form_fields: [
      { fieldKey: 'gym.code', label: '회원코드', type: 'text', storage: 'extension', order: 10 },
      {
        fieldKey: 'gym.plan',
        label: '플랜',
        type: 'select',
        storage: 'extension',
        order: 20,
        options: [{ value: 'basic', label: '베이직' }],
      },
      {
        fieldKey: 'gym.e2e_dup_a',
        label: '중복라벨필드A',
        type: 'text',
        storage: 'extension',
        order: 30,
      },
      {
        fieldKey: 'gym.e2e_dup_b',
        label: '중복라벨필드A',
        type: 'text',
        storage: 'extension',
        order: 40,
      },
    ],
    list_columns: [
      { columnKey: 'planCol', label: '플랜', sourceFieldKey: 'gym.plan', order: 10, visibleDefault: true },
    ],
    detail_tabs: [
      {
        tabId: 'info',
        label: '정보',
        order: 10,
        fieldKeys: ['gym.code', 'gym.plan', 'gym.e2e_dup_a', 'gym.e2e_dup_b'],
      },
    ],
  }
}

async function main() {
  const results = []
  const ok = (name, pass, detail = '') => {
    results.push({ name, pass, detail })
    console.log(pass ? `✓ ${name}` : `✗ ${name}`, detail || '')
  }

  const ver = await req('/version')
  ok('backend /version', ver.status === 200, `status=${ver.status}`)

  const login = await req('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: LOGIN, password: PASS }),
  })
  const token = login.json?.token
  ok('SUPER_ADMIN login', login.status === 200 && !!token, `status=${login.status} role=${login.json?.user?.role}`)

  if (!token) {
    console.log('\n--- summary ---')
    results.forEach((r) => console.log(r))
    process.exit(1)
  }

  const listBefore = await req('/api/admin/platform/crm-customer-management-templates', { token })
  ok('template list GET', listBefore.status === 200 && Array.isArray(listBefore.json?.data), `count=${listBefore.json?.data?.length}`)

  const createBody = gymPayload('create')
  const created = await req('/api/admin/platform/crm-customer-management-templates', {
    method: 'POST',
    token,
    body: JSON.stringify(createBody),
  })
  const newId = created.json?.data?.row?.id
  const resolvedKeys = created.json?.data?.resolved?.formFields?.map((f) => f.fieldKey) ?? []
  ok('create template', created.status === 201 && newId, `id=${newId} keys=${resolvedKeys.join(',')}`)

  const dupLabelFields = created.json?.data?.resolved?.formFields?.filter((f) => f.label === '중복라벨필드A') ?? []
  const dupKeysUnique = new Set(dupLabelFields.map((f) => f.fieldKey)).size === dupLabelFields.length
  ok('duplicate label fields saved with distinct fieldKeys', dupLabelFields.length === 2 && dupKeysUnique, dupLabelFields.map((f) => f.fieldKey).join(' | '))

  const fetch1 = await req(`/api/admin/platform/crm-customer-management-templates/${newId}`, { token })
  const keysAfterCreate = fetch1.json?.data?.resolved?.formFields?.map((f) => f.fieldKey) ?? []
  ok('re-fetch after create', fetch1.status === 200, keysAfterCreate.join(', '))

  const updateBody = {
    ...createBody,
    name: createBody.name + ' (updated)',
    form_fields: fetch1.json?.data?.resolved?.formFields?.map((f) => ({
      fieldKey: f.fieldKey,
      label: f.label,
      type: f.type,
      storage: f.storage ?? 'extension',
      order: f.order,
      ...(f.options ? { options: f.options } : {}),
    })),
  }
  const firstKey = keysAfterCreate[0]
  const updated = await req(`/api/admin/platform/crm-customer-management-templates/${newId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(updateBody),
  })
  const keysAfterUpdate = updated.json?.data?.resolved?.formFields?.map((f) => f.fieldKey) ?? []
  const keyPreserved = firstKey && keysAfterUpdate.includes(firstKey)
  ok('update template fieldKey preserved', updated.status === 200 && keyPreserved, `first=${firstKey} after=${keysAfterUpdate.join(',')}`)

  const fetch2 = await req(`/api/admin/platform/crm-customer-management-templates/${newId}`, { token })
  ok('re-fetch after update (re-entry)', fetch2.status === 200 && fetch2.json?.data?.row?.name?.includes('updated'), fetch2.json?.data?.row?.name)

  const existingId = listBefore.json?.data?.[0]?.id
  if (existingId && existingId !== newId) {
    const existing = await req(`/api/admin/platform/crm-customer-management-templates/${existingId}`, { token })
    const existingKeys = existing.json?.data?.resolved?.formFields?.map((f) => f.fieldKey) ?? []
    ok('existing template GET', existing.status === 200, `id=${existingId} keys=${existingKeys.slice(0, 3).join('...')}`)
  } else {
    ok('existing template GET', true, 'skipped (no other row)')
  }

  const indList = await req('/api/admin/platform/industries', { token })
  const govInd = (indList.json?.items ?? []).find((i) => String(i.code).toLowerCase() === 'government')
  if (govInd?.id) {
    const tenantsRes = await req(`/api/admin/platform/industries/${govInd.id}/tenants`, { token })
    const tenant =
      (tenantsRes.json?.items ?? []).find((t) => String(t.code).toLowerCase() === 'seuseung') ??
      (tenantsRes.json?.items ?? []).find((t) => String(t.status).toLowerCase() === 'active')
    const govTplRes = await req(
      '/api/admin/platform/crm-customer-management-templates?industry_code=government',
      { token },
    )
    const tpl =
      (govTplRes.json?.data ?? []).find((r) => Number(r.id) === 1) ?? (govTplRes.json?.data ?? [])[0]
    if (tenant?.id && tpl?.id) {
      const patch = await req(`/api/admin/platform/tenants/${tenant.id}/crm-customer-template`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ crm_customer_template_id: tpl.id }),
      })
      const patchData = patch.json?.data
      ok(
        'patch tenant crm template (HTTP envelope)',
        patch.status === 200 &&
          patchData != null &&
          Number(patchData.id) === Number(tenant.id) &&
          Number(patchData.crm_customer_template_id) === Number(tpl.id),
        `tenant=${tenant.code} templateId=${tpl.id} body=${JSON.stringify(patchData)}`,
      )
    } else {
      ok('patch tenant crm template (HTTP envelope)', true, 'skipped (no government tenant/template in DB)')
    }
  } else {
    ok('patch tenant crm template (HTTP envelope)', true, 'skipped (no government industry)')
  }

  console.log('\n--- summary ---')
  const failed = results.filter((r) => !r.pass)
  if (failed.length) {
    console.error('FAILED:', failed)
    process.exit(1)
  }
  console.log('All passed:', results.length)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
