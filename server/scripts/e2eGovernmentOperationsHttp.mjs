/**
 * Railway develop HTTP E2E — 공지·자료 (DB 불필요, secret 미출력).
 * npm run e2e:government:operations
 */
import {
  createE2eReporter,
  e2eApi,
  e2eLogin,
  resolveE2eGovernmentHttpConfig,
} from './lib/e2eGovernmentHttpEnv.mjs'

const { base: BASE, api: API, password: PASS, adminLoginId: ADMIN, programUserA, programUserB } =
  resolveE2eGovernmentHttpConfig({ requirePassword: true })

const { pass, fail, summary } = createE2eReporter()
const tag = Date.now().toString(36)

async function api(path, opts = {}) {
  return e2eApi(API, path, opts)
}

async function login(username) {
  return e2eLogin(API, username, PASS)
}

function keyOk(key) {
  const k = String(key ?? '')
  return k.includes('government/resources/') && !k.includes('gov_support_profiles')
}

async function main() {
  const health = await fetch(`${BASE}/backend/health`)
  if (health.status === 200) pass('health', '200')
  else fail('health', String(health.status))

  const industry = await login(ADMIN)
  pass('industry admin login', ADMIN)

  const agencies = (await api('/government-support/admin/agencies', { token: industry })).json?.data ?? []
  let tenantA = agencies[0]?.id
  let tenantB = agencies[1]?.id
  if (!tenantA) {
    const c = await api('/government-support/admin/agencies', {
      token: industry,
      method: 'POST',
      body: { name: `E2E A ${tag}`, code: `E2AA${tag}` },
      expectStatus: 200,
    })
    tenantA = c.json?.data?.id
  }
  if (!tenantB) {
    const c = await api('/government-support/admin/agencies', {
      token: industry,
      method: 'POST',
      body: { name: `E2E B ${tag}`, code: `E2AB${tag}` },
      expectStatus: 200,
    })
    tenantB = c.json?.data?.id
  }
  pass('tenants ready', `A=${tenantA} B=${tenantB}`)

  const uAA = `e2e_aa_${tag}`
  const uSt1 = `e2e_st1_${tag}`
  const uSt2 = `e2e_st2_${tag}`
  for (const [u, role] of [
    [uAA, 'government_agency_admin'],
    [uSt1, 'government_staff'],
    [uSt2, 'government_staff'],
  ]) {
    try {
      await api('/government-support/admin/users', {
        token: industry,
        method: 'POST',
        body: { username: u, password: PASS, role, tenantId: tenantA, displayName: u },
        expectStatus: 200,
      })
      pass(`create ${role}`, u)
    } catch (e) {
      if (String(e.message).includes('409')) pass(`reuse ${role}`, u)
      else throw e
    }
  }

  const ts = Date.now()
  const globalPub = await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E Global Published ${ts}`,
      content: 'g',
      category: 'important',
      status: 'published',
      scopeType: 'global',
      isPinned: true,
    },
    expectStatus: 200,
  })
  const globalDraft = await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E Global Draft ${ts}`,
      content: 'd',
      category: 'general',
      status: 'draft',
      scopeType: 'global',
    },
    expectStatus: 200,
  })
  const noticeA = await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E Agency A Published ${ts}`,
      content: 'a',
      category: 'deadline',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
    },
    expectStatus: 200,
  })
  const noticeAId = noticeA.json?.data?.id
  await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E Agency B Published ${ts}`,
      content: 'b',
      category: 'general',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantB,
    },
    expectStatus: 200,
  })
  pass('notices created')

  const presign = await api('/government-support/admin/resources/presign', {
    token: industry,
    method: 'POST',
    body: {
      scopeType: 'agency',
      tenantId: tenantA,
      fileName: 'e2e.pdf',
      contentType: 'application/pdf',
      sizeBytes: 20,
    },
    expectStatus: 200,
  })
  const { uploadUrl, objectKey, resourceId } = presign.json?.data ?? {}
  if (uploadUrl && keyOk(objectKey)) pass('presign', String(resourceId))
  else fail('presign')
  const body = `e2e-file-${ts}`
  const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body })
  if (put.status >= 200 && put.status < 300) pass('R2 PUT', String(put.status))
  else fail('R2 PUT', String(put.status))
  await api('/government-support/admin/resources', {
    token: industry,
    method: 'POST',
    body: {
      resourceId,
      fileKey: objectKey,
      fileName: 'e2e.pdf',
      fileSize: body.length,
      mimeType: 'application/pdf',
      status: 'published',
      title: `E2E Resource A ${ts}`,
      category: 'form',
    },
    expectStatus: 200,
  })
  pass('resource published', String(resourceId))

  const userA = await login(programUserA)
  pass('program user A login', programUserA)
  const titlesA = ((await api('/government-support/notices', { token: userA })).json?.data ?? []).map((n) => n.title)
  if (titlesA.some((t) => t.includes(`E2E Global Published ${ts}`))) pass('user A global notice')
  else fail('user A global notice')
  if (titlesA.some((t) => t.includes(`E2E Global Draft ${ts}`))) fail('user A draft hidden')
  else pass('user A draft hidden')
  if (titlesA.some((t) => t.includes(`E2E Agency B Published ${ts}`))) fail('user A B isolation')
  else pass('user A B isolation')
  await api('/government-support/admin/notices', {
    token: userA,
    method: 'POST',
    body: { title: 'x' },
    expectStatus: 403,
  })
  pass('user A admin 403')
  const dl = await api(`/government-support/resources/${resourceId}/download`, { token: userA })
  if (dl.status === 200 || dl.json?.data?.downloadUrl) pass('user A download')
  else fail('user A download', String(dl.status))

  const userB = await login(programUserB)
  const titlesB = ((await api('/government-support/notices', { token: userB })).json?.data ?? []).map((n) => n.title)
  if (titlesB.some((t) => t.includes(`E2E Agency B Published ${ts}`))) pass('user B own tenant notice')
  else fail('user B own tenant notice')
  if (titlesB.some((t) => t.includes(`E2E Agency A Published ${ts}`))) fail('user B A isolation')
  else pass('user B A isolation')

  const aa = await login(uAA)
  await api('/government-support/admin/notices', {
    token: aa,
    method: 'POST',
    body: {
      title: `E2E AA ${ts}`,
      content: 'x',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
      category: 'general',
    },
    expectStatus: 200,
  })
  pass('agency admin create')
  await api('/government-support/admin/notices', {
    token: aa,
    method: 'POST',
    body: {
      title: 'bad',
      content: 'x',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantB,
      category: 'general',
    },
    expectStatus: 403,
  })
  pass('agency admin tenant B forbidden')

  const st1 = await login(uSt1)
  const st2 = await login(uSt2)
  const stNotice = await api('/government-support/admin/notices', {
    token: st1,
    method: 'POST',
    body: {
      title: `E2E ST1 ${ts}`,
      content: 's',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
      category: 'general',
    },
    expectStatus: 200,
  })
  const stId = stNotice.json?.data?.id
  await api(`/government-support/admin/notices/${stId}`, { token: st2, method: 'DELETE', expectStatus: 403 })
  pass('staff2 delete others forbidden')
  await api(`/government-support/admin/notices/${stId}`, { token: st1, method: 'DELETE', expectStatus: 200 })
  pass('staff1 delete own')

  await api(`/government-support/admin/notices/${noticeAId}`, { token: industry, method: 'DELETE', expectStatus: 200 })
  const after = ((await api('/government-support/notices', { token: userA })).json?.data ?? []).map((n) => n.title)
  if (after.some((t) => t.includes(`E2E Agency A Published ${ts}`))) fail('archived hidden')
  else pass('archived hidden')

  const staffProfiles = await api('/government-support/profiles', { token: st1 })
  if (staffProfiles.status === 200 && (staffProfiles.json?.data ?? []).length === 0) pass('staff profiles empty')
  else fail('staff profiles empty')

  const mgr = await api('/government-support/notices?managerView=true', { token: industry })
  const ids = new Set((mgr.json?.data ?? []).map((n) => String(n.id)))
  if (ids.has(String(globalDraft.json?.data?.id))) pass('manager draft visible')
  else fail('manager draft visible')

  const failed = summary()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[FATAL]', e.message)
  process.exit(1)
})
