/**
 * Railway develop E2E — 공지/자료 (DB + HTTP). develop DB 전용.
 * npm run e2e:government:operations:db
 * (권장: railway run -e develop -s app npm run e2e:government:operations:db)
 */
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import pool from '../db.js'
import { attachGovernmentProgramUserMembership } from '../lib/governmentSupport/governmentSignup.js'
import { resolveGovernmentCrmGaId } from '../lib/governmentSupport/governmentAccess.js'
import {
  assertDevelopDbTarget,
  createE2eReporter,
  e2eApi,
  e2eLogin,
  resolveE2eGovernmentHttpConfig,
} from './lib/e2eGovernmentHttpEnv.mjs'

assertDevelopDbTarget()
const {
  base: BASE,
  api: API,
  password: E2E_PASS,
  adminLoginId,
} = resolveE2eGovernmentHttpConfig({ requirePassword: true })

const { pass, fail, summary } = createE2eReporter()

async function api(path, { token, method = 'GET', body, expectStatus } = {}) {
  return e2eApi(API, path, { token, method, body, expectStatus })
}

async function login(username, password) {
  const token = await e2eLogin(API, username, password)
  return { token, user: null }
}

async function ensureAdminUser(industryToken, { username, role, tenantId, displayName }) {
  try {
    await api('/government-support/admin/users', {
      token: industryToken,
      method: 'POST',
      body: { username, password: E2E_PASS, role, tenantId, displayName },
      expectStatus: 200,
    })
    pass(`create ${role}`, username)
  } catch (e) {
    if (String(e.message).includes('409')) pass(`reuse ${role}`, username)
    else throw e
  }
}

async function ensureProgramUser({ username, tenantId, industryId }) {
  const ex = await pool.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username])
  if (ex.rowCount) {
    pass('reuse program user', username)
    return ex.rows[0].id
  }
  const gaId = await resolveGovernmentCrmGaId(pool)
  const userId = randomUUID()
  const hash = await bcrypt.hash(E2E_PASS, 10)
  await pool.query(
    `INSERT INTO users (id, username, password_hash, role, ga_id, display_name, status, invited_by_user_id)
     VALUES ($1, $2, $3, 'USER', $4, $5, 'active', $1)`,
    [userId, username, hash, gaId, `E2E User ${username}`],
  )
  await attachGovernmentProgramUserMembership(pool, {
    userId,
    tenantDbId: Number(tenantId),
    industryId: Number(industryId),
  })
  pass('create program user', username)
  return userId
}

async function getIndustryId() {
  const r = await pool.query(`SELECT id FROM industries WHERE LOWER(code) = 'government' LIMIT 1`)
  return r.rows[0]?.id
}

function resourceKeyOk(key) {
  const k = String(key ?? '')
  return k.includes('government/resources/') && !k.includes('gov_support_profiles')
}

async function main() {
  const healthRes = await fetch(`${BASE}/backend/health`)
  if (healthRes.status === 200) pass('health', '200')
  else fail('health', String(healthRes.status))

  const loginId = adminLoginId
  const adminPass = E2E_PASS

  const industry = await login(loginId, adminPass)
  pass('industry admin login', loginId)

  const industryId = await getIndustryId()
  if (!industryId) {
    fail('industry id', 'missing')
    summary()
    process.exit(1)
  }

  const agenciesRes = await api('/government-support/admin/agencies', { token: industry.token })
  let agencies = agenciesRes.json?.data ?? []
  let tenantA = agencies[0]?.id ?? null
  let tenantB = agencies[1]?.id ?? null

  const tag = Date.now().toString(36)
  if (!tenantA) {
    const created = await api('/government-support/admin/agencies', {
      token: industry.token,
      method: 'POST',
      body: { name: `E2E Agency A ${tag}`, code: `E2AA${tag}` },
      expectStatus: 200,
    })
    tenantA = created.json?.data?.id
    pass('create agency A', String(tenantA))
  }
  if (!tenantB) {
    const created = await api('/government-support/admin/agencies', {
      token: industry.token,
      method: 'POST',
      body: { name: `E2E Agency B ${tag}`, code: `E2AB${tag}` },
      expectStatus: 200,
    })
    tenantB = created.json?.data?.id
    pass('create agency B', String(tenantB))
  }

  const uAgencyAdmin = `e2e_aa_${tag}`
  const uStaff1 = `e2e_st1_${tag}`
  const uStaff2 = `e2e_st2_${tag}`
  const uProgA = `e2e_ua_${tag}`
  const uProgB = `e2e_ub_${tag}`

  await ensureAdminUser(industry.token, {
    username: uAgencyAdmin,
    role: 'government_agency_admin',
    tenantId: tenantA,
    displayName: 'E2E Agency Admin',
  })
  await ensureAdminUser(industry.token, {
    username: uStaff1,
    role: 'government_staff',
    tenantId: tenantA,
    displayName: 'E2E Staff 1',
  })
  await ensureAdminUser(industry.token, {
    username: uStaff2,
    role: 'government_staff',
    tenantId: tenantA,
    displayName: 'E2E Staff 2',
  })
  await ensureProgramUser({ username: uProgA, tenantId: tenantA, industryId })
  await ensureProgramUser({ username: uProgB, tenantId: tenantB, industryId })

  const ts = Date.now()
  const globalPublished = await api('/government-support/admin/notices', {
    token: industry.token,
    method: 'POST',
    body: {
      title: `E2E Global Published ${ts}`,
      content: 'global published body',
      category: 'important',
      status: 'published',
      scopeType: 'global',
      isPinned: true,
    },
    expectStatus: 200,
  })
  pass('global published notice', String(globalPublished.json?.data?.id))

  const globalDraft = await api('/government-support/admin/notices', {
    token: industry.token,
    method: 'POST',
    body: {
      title: `E2E Global Draft ${ts}`,
      content: 'draft hidden',
      category: 'general',
      status: 'draft',
      scopeType: 'global',
    },
    expectStatus: 200,
  })
  pass('global draft notice', String(globalDraft.json?.data?.id))

  const agencyAPublished = await api('/government-support/admin/notices', {
    token: industry.token,
    method: 'POST',
    body: {
      title: `E2E Agency A Published ${ts}`,
      content: 'agency A only',
      category: 'deadline',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
    },
    expectStatus: 200,
  })
  const agencyANoticeId = agencyAPublished.json?.data?.id
  pass('agency A published notice', String(agencyANoticeId))

  await api('/government-support/admin/notices', {
    token: industry.token,
    method: 'POST',
    body: {
      title: `E2E Agency B Published ${ts}`,
      content: 'agency B only',
      category: 'general',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantB,
    },
    expectStatus: 200,
  })
  pass('agency B published notice')

  const presign = await api('/government-support/admin/resources/presign', {
    token: industry.token,
    method: 'POST',
    body: {
      scopeType: 'agency',
      tenantId: tenantA,
      fileName: 'e2e-sample.txt',
      contentType: 'text/plain',
      sizeBytes: 32,
    },
    expectStatus: 200,
  })
  const uploadUrl = presign.json?.data?.uploadUrl
  const objectKey = presign.json?.data?.objectKey
  const resourceId = presign.json?.data?.resourceId
  if (uploadUrl && objectKey && resourceKeyOk(objectKey)) {
    pass('presign issued', `resourceId=${resourceId}`)
    if (String(uploadUrl).includes('X-Amz-')) pass('presign url shape', 'presigned')
    else fail('presign url shape', 'unexpected')
  } else fail('presign response', 'invalid')

  const fileBody = `e2e government resource ${ts}`
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain', ...(presign.json?.data?.putHeaders ?? {}) },
    body: fileBody,
  })
  if (putRes.status >= 200 && putRes.status < 300) pass('R2 PUT upload', String(putRes.status))
  else fail('R2 PUT upload', String(putRes.status))

  await api('/government-support/admin/resources', {
    token: industry.token,
    method: 'POST',
    body: {
      resourceId,
      fileKey: objectKey,
      fileName: 'e2e-sample.txt',
      fileSize: fileBody.length,
      mimeType: 'text/plain',
      status: 'published',
      title: `E2E Resource A ${ts}`,
      description: 'published resource',
      category: 'form',
    },
    expectStatus: 200,
  })
  pass('resource A saved published', String(resourceId))

  const presignB = await api('/government-support/admin/resources/presign', {
    token: industry.token,
    method: 'POST',
    body: {
      scopeType: 'agency',
      tenantId: tenantB,
      fileName: 'e2e-b.txt',
      contentType: 'text/plain',
      sizeBytes: 8,
    },
    expectStatus: 200,
  })
  const resourceBId = presignB.json?.data?.resourceId
  await fetch(presignB.json?.data?.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: 'tenant-b',
  })
  await api('/government-support/admin/resources', {
    token: industry.token,
    method: 'POST',
    body: {
      resourceId: resourceBId,
      fileKey: presignB.json?.data?.objectKey,
      fileName: 'e2e-b.txt',
      fileSize: 8,
      mimeType: 'text/plain',
      status: 'published',
      title: `E2E Resource B ${ts}`,
      category: 'other',
    },
    expectStatus: 200,
  })
  pass('resource B saved published', String(resourceBId))

  // Program user A read-only
  const progA = await login(uProgA, E2E_PASS)
  const userANotices = await api('/government-support/notices', { token: progA.token })
  const titlesA = (userANotices.json?.data ?? []).map((n) => n.title)
  if (titlesA.some((t) => t.includes(`E2E Agency A Published ${ts}`))) pass('user A sees agency A notice')
  else fail('user A sees agency A notice')
  if (titlesA.some((t) => t.includes(`E2E Global Published ${ts}`))) pass('user A sees global notice')
  else fail('user A sees global notice')
  if (titlesA.some((t) => t.includes(`E2E Agency B Published ${ts}`))) fail('user A tenant isolation notices')
  else pass('user A tenant isolation notices')
  if (titlesA.some((t) => t.includes(`E2E Global Draft ${ts}`))) fail('user A draft hidden')
  else pass('user A draft hidden')

  try {
    await api('/government-support/admin/notices', {
      token: progA.token,
      method: 'POST',
      body: { title: 'x' },
      expectStatus: 403,
    })
    pass('user A admin notices 403')
  } catch (e) {
    fail('user A admin notices 403', e.message)
  }
  try {
    await api('/government-support/admin/resources', {
      token: progA.token,
      method: 'POST',
      body: { title: 'x' },
      expectStatus: 403,
    })
    pass('user A admin resources 403')
  } catch (e) {
    fail('user A admin resources 403', e.message)
  }

  const resourcesA = await api('/government-support/resources', { token: progA.token })
  const resTitlesA = (resourcesA.json?.data ?? []).map((r) => r.title)
  if (resTitlesA.some((t) => t.includes(`E2E Resource A ${ts}`))) pass('user A sees resource A')
  else fail('user A sees resource A')
  if (resTitlesA.some((t) => t.includes(`E2E Resource B ${ts}`))) fail('user A resource isolation')
  else pass('user A resource isolation')

  const dl = await api(`/government-support/resources/${resourceId}/download`, { token: progA.token })
  if (dl.status === 200 || dl.json?.data?.downloadUrl || dl.json?.data?.url) pass('user A download', String(dl.status))
  else fail('user A download', String(dl.status))

  // Program user B isolation
  const progB = await login(uProgB, E2E_PASS)
  const userBNotices = await api('/government-support/notices', { token: progB.token })
  const titlesB2 = (userBNotices.json?.data ?? []).map((n) => n.title)
  if (titlesB2.some((t) => t.includes(`E2E Agency B Published ${ts}`))) pass('user B sees agency B notice')
  else fail('user B sees agency B notice')
  if (titlesB2.some((t) => t.includes(`E2E Agency A Published ${ts}`))) fail('user B tenant isolation')
  else pass('user B tenant isolation')

  // Agency admin tenant scope
  const agencyAdmin = await login(uAgencyAdmin, E2E_PASS)
  await api('/government-support/admin/notices', {
    token: agencyAdmin.token,
    method: 'POST',
    body: {
      title: `E2E AA notice ${ts}`,
      content: 'aa',
      category: 'general',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
    },
    expectStatus: 200,
  })
  pass('agency admin create own tenant notice')
  try {
    await api('/government-support/admin/notices', {
      token: agencyAdmin.token,
      method: 'POST',
      body: {
        title: 'bad',
        content: 'x',
        status: 'published',
        scopeType: 'agency',
        tenantId: tenantB,
      },
      expectStatus: 403,
    })
    pass('agency admin cannot write tenant B')
  } catch (e) {
    fail('agency admin cannot write tenant B', e.message)
  }

  // Staff create + delete rules
  const staff1 = await login(uStaff1, E2E_PASS)
  const staff2 = await login(uStaff2, E2E_PASS)
  const staffNotice = await api('/government-support/admin/notices', {
    token: staff1.token,
    method: 'POST',
    body: {
      title: `E2E Staff1 notice ${ts}`,
      content: 'staff1',
      category: 'general',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
    },
    expectStatus: 200,
  })
  const staffNoticeId = staffNotice.json?.data?.id
  pass('staff create notice', String(staffNoticeId))

  try {
    await api(`/government-support/admin/notices/${staffNoticeId}`, {
      token: staff2.token,
      method: 'DELETE',
      expectStatus: 403,
    })
    pass('staff2 cannot delete staff1 notice')
  } catch (e) {
    fail('staff2 cannot delete staff1 notice', e.message)
  }

  await api(`/government-support/admin/notices/${staffNoticeId}`, {
    token: staff1.token,
    method: 'DELETE',
    expectStatus: 200,
  })
  pass('staff1 deletes own notice')

  // Archive hides from user
  await api(`/government-support/admin/notices/${agencyANoticeId}`, {
    token: industry.token,
    method: 'DELETE',
    expectStatus: 200,
  })
  pass('archive agency A notice')
  const afterArchive = await api('/government-support/notices', { token: progA.token })
  const afterTitles = (afterArchive.json?.data ?? []).map((n) => n.title)
  if (afterTitles.some((t) => t.includes(`E2E Agency A Published ${ts}`))) fail('archived hidden from user')
  else pass('archived hidden from user')

  // Profiles non-interference: staff gets empty profiles (not user data)
  const staffProfiles = await api('/government-support/profiles', { token: staff1.token })
  if (staffProfiles.status === 200 && Array.isArray(staffProfiles.json?.data) && staffProfiles.json.data.length === 0) {
    pass('staff profiles empty (no user data leak)')
  } else {
    fail('staff profiles empty', `count=${staffProfiles.json?.data?.length ?? '?'}`)
  }

  // Cross-tenant read other agency notice
  try {
    await api(`/government-support/notices/${agencyANoticeId}`, {
      token: progB.token,
      expectStatus: 404,
    })
    pass('cross-tenant notice detail 404')
  } catch (e) {
    if (String(e.message).includes('403')) pass('cross-tenant notice detail 403')
    else fail('cross-tenant notice detail', e.message)
  }

  // Manager sees draft
  const mgrNotices = await api('/government-support/notices?managerView=true', { token: industry.token })
  const mgrIds = new Set((mgrNotices.json?.data ?? []).map((n) => String(n.id)))
  if (mgrIds.has(String(globalDraft.json?.data?.id))) pass('manager sees draft')
  else fail('manager sees draft')

  try {
    await api('/government-support/admin/notices', { method: 'POST', body: {}, expectStatus: 401 })
    pass('unauthenticated admin 401')
  } catch (e) {
    fail('unauthenticated admin 401', e.message)
  }

  if (resourceKeyOk(objectKey)) pass('R2 key path', 'government/resources/...')
  else fail('R2 key path')

  const failedCount = summary()
  await pool.end()
  process.exit(failedCount > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[FATAL]', e.message)
  summary()
  pool.end().finally(() => process.exit(1))
})
