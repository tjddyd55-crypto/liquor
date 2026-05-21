/**
 * Railway develop — 이용자 workspace HTTP E2E (secret 미출력).
 * npm run e2e:government:user-workspace
 */
import {
  createE2eReporter,
  e2eApi,
  e2eLogin,
  resolveE2eGovernmentHttpConfig,
} from './lib/e2eGovernmentHttpEnv.mjs'
import {
  resolveE2eProgramUsers,
  tryResolveIndustryAdminToken,
} from './lib/e2eGovernmentSignatureSelfSeed.mjs'

const {
  base: BASE,
  api: API,
  password: PASS,
  hasPassword,
  adminLoginId: ADMIN,
  programUserA,
  programUserB,
} = resolveE2eGovernmentHttpConfig({ requirePassword: false })

const { pass, fail, summary } = createE2eReporter()
const tag = Date.now().toString(36)

async function api(path, opts = {}) {
  return e2eApi(API, path, opts)
}

async function login(username, password = PASS) {
  return e2eLogin(API, username, password)
}

function skip(name, detail = '') {
  pass(name, detail ? `SKIP — ${detail}` : 'SKIP')
}

function unwrapData(json) {
  if (json?.data != null) return json.data
  return json
}

async function fetchHtml(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'text/html' } })
  const html = await res.text()
  const bundle = html.match(/index-[^.]+\.js/)?.[0] ?? null
  let js = ''
  if (bundle) {
    js = await (await fetch(`${BASE}/assets/${bundle}`)).text()
  }
  return { status: res.status, html, js, bundle }
}

async function main() {
  // Deploy sanity
  const health = await fetch(`${BASE}/backend/health`)
  if (health.status === 200) pass('health 200')
  else fail('health', String(health.status))

  const homeHtml = await fetchHtml('/government/workspace')
  if (homeHtml.status === 200) pass('GET /government/workspace', homeHtml.bundle ?? '')
  else fail('GET /government/workspace', String(homeHtml.status))

  const navMarkers = [
    'government-user-layout',
    '/government/my-applications',
    '내 고객/신청',
    '/government/me',
    '서류/파일',
    '/files/presign',
  ]
  for (const m of navMarkers) {
    if (homeHtml.js.includes(m)) pass(`bundle contains ${m}`)
    else fail(`bundle contains ${m}`)
  }

  /** @type {string | null} */
  let industry = null
  if (hasPassword) {
    industry = await login(ADMIN)
    pass('industry admin login')
  } else {
    industry = await tryResolveIndustryAdminToken(API, { adminLoginId: ADMIN, optionalPassword: PASS })
    if (industry) pass('industry admin login')
    else skip('industry admin login', 'E2E_GOVERNMENT_PASSWORD 없음')
  }

  let tenantA = null
  let tenantB = null
  const uStaff = `e2e_st_ws_${tag}`
  const uAgency = `e2e_aa_ws_${tag}`

  if (industry) {
    const agencies = (await api('/government-support/admin/agencies', { token: industry })).json?.data ?? []
    tenantA = agencies[0]?.id
    tenantB = agencies[1]?.id
    if (!tenantA || !tenantB) fail('tenants A/B', 'need two agencies')
    else pass('tenants ready', `A=${tenantA} B=${tenantB}`)

    for (const [u, role] of [
      [uStaff, 'government_staff'],
      [uAgency, 'government_agency_admin'],
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
  } else {
    skip('tenants A/B', 'admin token unavailable')
    skip('create government_staff', 'admin token unavailable')
    skip('create government_agency_admin', 'admin token unavailable')
  }

  const ts = Date.now()
  /** @type {string | undefined} */
  let resourceId
  if (!industry) {
    skip('notices seeded', 'admin token unavailable')
    skip('resource A published', 'admin token unavailable')
  } else {
  const globalPub = await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E WS Global ${ts}`,
      content: 'g',
      category: 'important',
      status: 'published',
      scopeType: 'global',
    },
    expectStatus: 200,
  })
  const globalDraft = await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E WS Draft ${ts}`,
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
      title: `E2E WS AgencyA ${ts}`,
      content: 'a',
      category: 'deadline',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantA,
    },
    expectStatus: 200,
  })
  await api('/government-support/admin/notices', {
    token: industry,
    method: 'POST',
    body: {
      title: `E2E WS AgencyB ${ts}`,
      content: 'b',
      category: 'general',
      status: 'published',
      scopeType: 'agency',
      tenantId: tenantB,
    },
    expectStatus: 200,
  })
  pass('notices seeded')

  const presign = await api('/government-support/admin/resources/presign', {
    token: industry,
    method: 'POST',
    body: {
      scopeType: 'agency',
      tenantId: tenantA,
      fileName: 'ws-e2e.pdf',
      contentType: 'application/pdf',
      sizeBytes: 16,
    },
    expectStatus: 200,
  })
  const { uploadUrl, objectKey, resourceId: seededResourceId } = presign.json?.data ?? {}
  resourceId = seededResourceId
  const fileBody = `ws-e2e-${ts}`
  await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: fileBody })
  await api('/government-support/admin/resources', {
    token: industry,
    method: 'POST',
    body: {
      resourceId,
      fileKey: objectKey,
      fileName: 'ws-e2e.pdf',
      fileSize: fileBody.length,
      mimeType: 'application/pdf',
      status: 'published',
      title: `E2E WS ResourceA ${ts}`,
      category: 'form',
    },
    expectStatus: 200,
  })
  pass('resource A published', String(resourceId))
  }

  const programUsers = await resolveE2eProgramUsers(API, {
    optionalPassword: PASS,
    userA: programUserA,
    userB: programUserB,
  })
  pass('program user A ready', `${programUsers.userA.username} (${programUsers.userA.seeded ? 'http-register' : 'env-login'})`)
  pass('program user B ready', `${programUsers.userB.username} (${programUsers.userB.seeded ? 'http-register' : 'env-login'})`)

  // Program user A
  const tokenA = programUsers.userA.token
  pass('program user A login', programUsers.userA.username)

  const accessA = unwrapData((await api('/government-support/me/access', { token: tokenA })).json)
  if (accessA?.isGovernmentProgramUser === true) pass('user A is program user')
  else fail('user A is program user')
  if (accessA?.programUserTenantName) pass('user A tenant name present')
  else fail('user A tenant name present')
  if (accessA?.accountCreatedAt) pass('user A accountCreatedAt present')
  else fail('user A accountCreatedAt present')

  const meA = unwrapData((await api('/me', { token: tokenA })).json)
  if (meA?.username === programUsers.userA.username) pass('user A me username')
  else fail('user A me username')
  if (meA?.status) pass('user A me status', meA.status)

  const before = (await api('/government-support/profiles', { token: tokenA })).json?.data ?? []
  const created = await api('/government-support/profiles', {
    token: tokenA,
    method: 'POST',
    body: { businessName: `E2E Biz A ${ts}`, customerName: `E2E Cust ${ts}` },
    expectStatus: 200,
  })
  const profileAId = String(created.json?.data?.id ?? created.json?.id ?? '')
  if (profileAId) pass('user A create profile', profileAId)
  else fail('user A create profile')

  const after = (await api('/government-support/profiles', { token: tokenA })).json?.data ?? []
  if (after.some((p) => String(p.id) === profileAId)) pass('user A profile in list after create')
  else fail('user A profile in list after create')
  if (after.length >= before.length + 1) pass('user A list refetch count increased')
  else fail('user A list refetch count increased')

  const detailA = await api(`/government-support/profiles/${profileAId}`, { token: tokenA })
  if (detailA.status === 200) pass('user A profile detail 200')
  else fail('user A profile detail', String(detailA.status))

  const memoCreate = await api(`/government-support/profiles/${profileAId}/memos`, {
    token: tokenA,
    method: 'POST',
    body: { content: `E2E memo A ${ts}` },
    expectStatus: 200,
  })
  const memoAId = String(memoCreate.json?.data?.id ?? '')
  if (memoAId) pass('user A create memo', memoAId)
  else fail('user A create memo')

  const memoListA = (await api(`/government-support/profiles/${profileAId}/memos`, { token: tokenA })).json?.data ?? []
  if (memoListA.some((m) => String(m.id) === memoAId)) pass('user A memo in list')
  else fail('user A memo in list')

  const memoPatch = await api(`/government-support/profiles/${profileAId}/memos/${memoAId}`, {
    token: tokenA,
    method: 'PATCH',
    body: { content: `E2E memo A patched ${ts}` },
    expectStatus: 200,
  })
  if (String(memoPatch.json?.data?.content ?? '').includes('patched')) pass('user A patch memo')
  else fail('user A patch memo')

  await api(`/government-support/profiles/${profileAId}/memos/${memoAId}`, {
    token: tokenA,
    method: 'DELETE',
    expectStatus: 200,
  })
  const memoListAfterDelete =
    (await api(`/government-support/profiles/${profileAId}/memos`, { token: tokenA })).json?.data ?? []
  if (!memoListAfterDelete.some((m) => String(m.id) === memoAId)) pass('user A delete memo')
  else fail('user A delete memo')

  const consultCreate = await api(`/government-support/profiles/${profileAId}/consultations`, {
    token: tokenA,
    method: 'POST',
    body: { body: `E2E consult A ${ts}`, consultationDate: '2026-05-19' },
    expectStatus: 200,
  })
  const consultAId = String(consultCreate.json?.data?.id ?? '')
  if (consultAId) pass('user A create consultation', consultAId)
  else fail('user A create consultation')

  const consultListA =
    (await api(`/government-support/profiles/${profileAId}/consultations`, { token: tokenA })).json?.data ?? []
  if (consultListA.some((c) => String(c.id) === consultAId)) pass('user A consultation in list')
  else fail('user A consultation in list')

  const consultPatch = await api(`/government-support/profiles/${profileAId}/consultations/${consultAId}`, {
    token: tokenA,
    method: 'PATCH',
    body: { body: `E2E consult A patched ${ts}` },
    expectStatus: 200,
  })
  if (String(consultPatch.json?.data?.body ?? '').includes('patched')) pass('user A patch consultation')
  else fail('user A patch consultation')

  await api(`/government-support/profiles/${profileAId}/consultations/${consultAId}`, {
    token: tokenA,
    method: 'DELETE',
    expectStatus: 200,
  })
  const consultListAfterDelete =
    (await api(`/government-support/profiles/${profileAId}/consultations`, { token: tokenA })).json?.data ?? []
  if (!consultListAfterDelete.some((c) => String(c.id) === consultAId)) pass('user A delete consultation')
  else fail('user A delete consultation')

  const progressCreate = await api(`/government-support/profiles/${profileAId}/progress`, {
    token: tokenA,
    method: 'POST',
    body: {
      status: '심사 중',
      content: `E2E progress A ${ts}`,
      title: 'E2E 진행',
      eventDate: '2026-05-19',
    },
    expectStatus: 201,
  })
  const progressAId = String(progressCreate.json?.data?.id ?? '')
  if (progressAId) pass('user A create progress', progressAId)
  else fail('user A create progress')

  const progressListA =
    (await api(`/government-support/profiles/${profileAId}/progress`, { token: tokenA })).json?.data ?? []
  if (progressListA.some((p) => String(p.id) === progressAId)) pass('user A progress in list')
  else fail('user A progress in list')

  const detailAfterProgress = unwrapData((await api(`/government-support/profiles/${profileAId}`, { token: tokenA })).json)
  if (detailAfterProgress?.progressStatus === '심사 중') pass('user A profile progressStatus synced')
  else fail('user A profile progressStatus synced', String(detailAfterProgress?.progressStatus))

  const progressPatch = await api(`/government-support/profiles/${profileAId}/progress/${progressAId}`, {
    token: tokenA,
    method: 'PATCH',
    body: { content: `E2E progress A patched ${ts}`, status: '보완 요청' },
    expectStatus: 200,
  })
  if (String(progressPatch.json?.data?.content ?? '').includes('patched')) pass('user A patch progress')
  else fail('user A patch progress')

  await api(`/government-support/profiles/${profileAId}/progress/${progressAId}`, {
    token: tokenA,
    method: 'DELETE',
    expectStatus: 200,
  })
  const progressListAfterDelete =
    (await api(`/government-support/profiles/${profileAId}/progress`, { token: tokenA })).json?.data ?? []
  if (!progressListAfterDelete.some((p) => String(p.id) === progressAId)) pass('user A delete progress')
  else fail('user A delete progress')

  const profileFileName = `e2e-ws-${ts}.pdf`
  const profileFileBody = `E2E profile file ${ts}`
  const profileFileSize = profileFileBody.length
  let profileFileId = ''
  const filePresign = await api(`/government-support/profiles/${profileAId}/files/presign`, {
    token: tokenA,
    method: 'POST',
    body: {
      fileName: profileFileName,
      contentType: 'application/pdf',
      sizeBytes: profileFileSize,
      description: `E2E file ${ts}`,
    },
    expectStatus: 201,
  })
  const { uploadUrl: profileUploadUrl, objectKey: profileObjectKey, fileId: presignedFileId } =
    filePresign.json?.data ?? {}
  profileFileId = String(presignedFileId ?? '')
  if (profileUploadUrl && profileObjectKey && profileFileId) pass('user A file presign', profileFileId)
  else fail('user A file presign')
  const objectKeyNorm = String(profileObjectKey ?? '').replace(/^\/+/, '')
  if (objectKeyNorm.includes('government/profile-files/')) pass('profile file R2 key path')
  else fail('profile file R2 key path', objectKeyNorm.slice(0, 80))

  const profilePut = await fetch(profileUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf',
      ...(filePresign.json?.data?.putHeaders ?? {}),
    },
    body: profileFileBody,
  })
  if (profilePut.status >= 200 && profilePut.status < 300) pass('user A R2 PUT profile file', String(profilePut.status))
  else fail('user A R2 PUT profile file', String(profilePut.status))

  const fileSave = await api(`/government-support/profiles/${profileAId}/files`, {
    token: tokenA,
    method: 'POST',
    body: {
      fileId: profileFileId,
      objectKey: profileObjectKey,
      fileName: profileFileName,
      fileSize: profileFileSize,
      mimeType: 'application/pdf',
    },
    expectStatus: 201,
  })
  if (String(fileSave.json?.data?.id ?? '') === profileFileId) pass('user A save profile file')
  else fail('user A save profile file')

  const fileListA =
    (await api(`/government-support/profiles/${profileAId}/files`, { token: tokenA })).json?.data ?? []
  if (fileListA.some((f) => String(f.id) === profileFileId)) pass('user A file in list')
  else fail('user A file in list')

  const fileDlA = await api(`/government-support/profiles/${profileAId}/files/${profileFileId}/download`, {
    token: tokenA,
  })
  if (fileDlA.status === 200 && (fileDlA.json?.data?.downloadUrl || fileDlA.json?.data?.url)) {
    pass('user A file download')
  } else fail('user A file download', String(fileDlA.status))

  const filePatchA = await api(`/government-support/profiles/${profileAId}/files/${profileFileId}`, {
    token: tokenA,
    method: 'PATCH',
    body: { fileName: `e2e-ws-patched-${ts}.pdf`, description: 'patched' },
    expectStatus: 200,
  })
  if (String(filePatchA.json?.data?.fileName ?? '').includes('patched')) pass('user A patch profile file')
  else fail('user A patch profile file')

  const memoRegression = await api(`/government-support/profiles/${profileAId}/memos`, {
    token: tokenA,
    method: 'POST',
    body: { content: `E2E memo regression ${ts}` },
    expectStatus: 200,
  })
  if (memoRegression.json?.data?.id) pass('memo regression create after consultations')
  else fail('memo regression create after consultations')

  if (industry) {
    const titlesA = ((await api('/government-support/notices', { token: tokenA })).json?.data ?? []).map((n) => n.title)
    if (titlesA.some((t) => t.includes(`E2E WS Global ${ts}`))) pass('user A global notice')
    else fail('user A global notice')
    if (titlesA.some((t) => t.includes(`E2E WS AgencyA ${ts}`))) pass('user A agency A notice')
    else fail('user A agency A notice')
    if (titlesA.some((t) => t.includes(`E2E WS AgencyB ${ts}`))) fail('user A agency B isolation')
    else pass('user A agency B isolation')
    if (titlesA.some((t) => t.includes(`E2E WS Draft ${ts}`))) fail('user A draft hidden')
    else pass('user A draft hidden')

    const resA = ((await api('/government-support/resources', { token: tokenA })).json?.data ?? []).map((r) => r.title)
    if (resA.some((t) => t.includes(`E2E WS ResourceA ${ts}`))) pass('user A resource A')
    else fail('user A resource A')
    const dl = await api(`/government-support/resources/${resourceId}/download`, { token: tokenA })
    if (dl.status === 200 || dl.json?.data?.downloadUrl || dl.json?.data?.url) pass('user A download')
    else fail('user A download', String(dl.status))
  } else {
    skip('user A global notice', 'admin seed skipped')
    skip('user A agency A notice', 'admin seed skipped')
    skip('user A agency B isolation', 'admin seed skipped')
    skip('user A draft hidden', 'admin seed skipped')
    skip('user A resource A', 'admin seed skipped')
    skip('user A download', 'admin seed skipped')
  }

  try {
    await api('/government-support/admin/notices', {
      token: tokenA,
      method: 'POST',
      body: { title: 'x' },
      expectStatus: 403,
    })
    pass('user A admin notices 403')
  } catch (e) {
    fail('user A admin notices 403', e.message)
  }

  // Program user B isolation
  const tokenB = programUsers.userB.token
  pass('program user B login', programUsers.userB.username)
  const listB = (await api('/government-support/profiles', { token: tokenB })).json?.data ?? []
  if (!listB.some((p) => String(p.id) === profileAId)) pass('user B cannot list A profile')
  else fail('user B cannot list A profile')
  try {
    await api(`/government-support/profiles/${profileAId}`, { token: tokenB, expectStatus: 403 })
    pass('user B profile detail 403')
  } catch (e) {
    if (String(e.message).includes('404')) pass('user B profile detail 404')
    else fail('user B profile detail forbidden', e.message)
  }

  const memoBCreate = await api(`/government-support/profiles/${profileAId}/memos`, {
    token: tokenB,
    method: 'POST',
    body: { content: 'blocked' },
  })
  if (memoBCreate.status === 403 || memoBCreate.status === 404) pass('user B memo create blocked')
  else fail('user B memo create blocked', String(memoBCreate.status))

  const memoBList = await api(`/government-support/profiles/${profileAId}/memos`, { token: tokenB })
  if (memoBList.status === 403 || memoBList.status === 404) pass('user B memo list blocked')
  else fail('user B memo list blocked', String(memoBList.status))

  const consultBCreate = await api(`/government-support/profiles/${profileAId}/consultations`, {
    token: tokenB,
    method: 'POST',
    body: { body: 'blocked' },
  })
  if (consultBCreate.status === 403 || consultBCreate.status === 404) pass('user B consultation create blocked')
  else fail('user B consultation create blocked', String(consultBCreate.status))

  const consultBList = await api(`/government-support/profiles/${profileAId}/consultations`, { token: tokenB })
  if (consultBList.status === 403 || consultBList.status === 404) pass('user B consultation list blocked')
  else fail('user B consultation list blocked', String(consultBList.status))

  const progressBCreate = await api(`/government-support/profiles/${profileAId}/progress`, {
    token: tokenB,
    method: 'POST',
    body: { status: '심사 중', content: 'blocked' },
  })
  if (progressBCreate.status === 403 || progressBCreate.status === 404) pass('user B progress create blocked')
  else fail('user B progress create blocked', String(progressBCreate.status))

  const progressBList = await api(`/government-support/profiles/${profileAId}/progress`, { token: tokenB })
  if (progressBList.status === 403 || progressBList.status === 404) pass('user B progress list blocked')
  else fail('user B progress list blocked', String(progressBList.status))

  const fileBList = await api(`/government-support/profiles/${profileAId}/files`, { token: tokenB })
  if (fileBList.status === 403 || fileBList.status === 404) pass('user B file list blocked')
  else fail('user B file list blocked', String(fileBList.status))

  const fileBDownload = await api(`/government-support/profiles/${profileAId}/files/${profileFileId}/download`, {
    token: tokenB,
  })
  if (fileBDownload.status === 403 || fileBDownload.status === 404) pass('user B file download blocked')
  else fail('user B file download blocked', String(fileBDownload.status))

  const fileBCreate = await api(`/government-support/profiles/${profileAId}/files/presign`, {
    token: tokenB,
    method: 'POST',
    body: {
      fileName: 'blocked.pdf',
      contentType: 'application/pdf',
      sizeBytes: 8,
    },
  })
  if (fileBCreate.status === 403 || fileBCreate.status === 404) pass('user B file presign blocked')
  else fail('user B file presign blocked', String(fileBCreate.status))

  // Operational roles — API access shape (frontend redirect tested separately)
  if (industry) {
    const tokenStaff = await login(uStaff)
    const accessStaff = unwrapData((await api('/government-support/me/access', { token: tokenStaff })).json)
    if (accessStaff?.isGovernmentProgramUser !== true) pass('staff not program user')
    else fail('staff not program user')
    const staffProfiles = await api('/government-support/profiles', { token: tokenStaff })
    if (staffProfiles.status === 200 && (staffProfiles.json?.data ?? []).length === 0) pass('staff profiles empty')
    else fail('staff profiles empty')

    const tokenAgency = await login(uAgency)
    const accessAgency = unwrapData((await api('/government-support/me/access', { token: tokenAgency })).json)
    if (accessAgency?.isGovernmentProgramUser !== true) pass('agency admin not program user')
    else fail('agency admin not program user')

    const memoStaffList = await api(`/government-support/profiles/${profileAId}/memos`, { token: tokenStaff })
    if (memoStaffList.status === 403) pass('staff memo list 403')
    else fail('staff memo list 403', String(memoStaffList.status))

    const memoAgencyList = await api(`/government-support/profiles/${profileAId}/memos`, { token: tokenAgency })
    if (memoAgencyList.status === 403) pass('agency admin memo list 403')
    else fail('agency admin memo list 403', String(memoAgencyList.status))

    const consultStaffList = await api(`/government-support/profiles/${profileAId}/consultations`, { token: tokenStaff })
    if (consultStaffList.status === 403) pass('staff consultation list 403')
    else fail('staff consultation list 403', String(consultStaffList.status))

    const consultAgencyList = await api(`/government-support/profiles/${profileAId}/consultations`, { token: tokenAgency })
    if (consultAgencyList.status === 403) pass('agency admin consultation list 403')
    else fail('agency admin consultation list 403', String(consultAgencyList.status))

    const progressStaffList = await api(`/government-support/profiles/${profileAId}/progress`, { token: tokenStaff })
    if (progressStaffList.status === 403) pass('staff progress list 403')
    else fail('staff progress list 403', String(progressStaffList.status))

    const progressAgencyList = await api(`/government-support/profiles/${profileAId}/progress`, { token: tokenAgency })
    if (progressAgencyList.status === 403) pass('agency admin progress list 403')
    else fail('agency admin progress list 403', String(progressAgencyList.status))

    const fileStaffList = await api(`/government-support/profiles/${profileAId}/files`, { token: tokenStaff })
    if (fileStaffList.status === 403) pass('staff file list 403')
    else fail('staff file list 403', String(fileStaffList.status))

    const fileAgencyList = await api(`/government-support/profiles/${profileAId}/files`, { token: tokenAgency })
    if (fileAgencyList.status === 403) pass('agency admin file list 403')
    else fail('agency admin file list 403', String(fileAgencyList.status))
  } else {
    for (const name of [
      'staff not program user',
      'staff profiles empty',
      'agency admin not program user',
      'staff memo list 403',
      'agency admin memo list 403',
      'staff consultation list 403',
      'agency admin consultation list 403',
      'staff progress list 403',
      'agency admin progress list 403',
      'staff file list 403',
      'agency admin file list 403',
    ]) {
      skip(name, 'admin credentials unavailable')
    }
  }

  await api(`/government-support/profiles/${profileAId}/files/${profileFileId}`, {
    token: tokenA,
    method: 'DELETE',
    expectStatus: 200,
  })
  const fileListAfterDelete =
    (await api(`/government-support/profiles/${profileAId}/files`, { token: tokenA })).json?.data ?? []
  if (!fileListAfterDelete.some((f) => String(f.id) === profileFileId)) pass('user A delete profile file')
  else fail('user A delete profile file')

  if (industry) {
    const accessIndustry = unwrapData((await api('/government-support/me/access', { token: industry })).json)
    if (accessIndustry?.isGovernmentIndustryAdmin === true || accessIndustry?.isSuperAdmin === true) {
      pass('industry admin operational')
    } else fail('industry admin operational')
  } else {
    skip('industry admin operational', 'admin credentials unavailable')
  }

  // SPA routes exist in bundle for staff (redirect is client-side)
  const staffBundle = (await fetchHtml('/government/admin/notices')).js
  if (staffBundle.includes('government-admin-layout') && !staffBundle.includes('government-user-layout__nav-link--active')) {
    pass('admin layout in bundle')
  } else if (staffBundle.includes('government-admin-layout')) pass('admin layout in bundle')
  else fail('admin layout in bundle')

  const failed = summary()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('[FATAL]', e.message)
  process.exit(1)
})
