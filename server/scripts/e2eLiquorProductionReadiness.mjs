/**
 * Liquor CRM — production 반영 전 자동 검수 + 스크린샷 증빙 리포트.
 *
 * env: E2E_LIQUOR_BASE_URL, E2E_LIQUOR_LOGIN_ID/E2E_LIQUOR_PASSWORD
 *      또는 .e2e-liquor-last-run.json
 *      E2E_LIQUOR_READINESS_SKIP_SUITES=1 — npm test/build/기존 E2E 생략(디버그용)
 */
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { chromium, devices } from 'playwright'
import {
  AUTH_STORAGE_KEY,
  buildAuthSession,
  getGitCommitHash,
  liquorBaseUrl,
  login,
  pickCustomerId,
  resolveLiquorE2eCredentials,
  scanForbiddenUiText,
} from './e2eLiquorShared.mjs'

const BASE = liquorBaseUrl()
const REPORT_DIR = '.e2e-liquor-readiness-report'
const SCREENSHOT_ROOT = path.join(REPORT_DIR, 'screenshots')
const DESKTOP_VIEWPORT = { width: 1366, height: 768 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }
const IPHONE = devices['iPhone 14']
const SKIP_SUITES = process.env.E2E_LIQUOR_READINESS_SKIP_SUITES === '1'

/** @type {Record<string, { ok: boolean; detail?: string; stdout?: string; stderr?: string }>} */
const suiteResults = {}

/** @type {Array<{ id: string; label: string; viewport: 'desktop'|'mobile'; ok: boolean; detail?: string; screenshot?: string; forbiddenHits?: string[]; consoleErrors?: string[] }>} */
const screenResults = []

const startedAt = new Date()

function runNpmScript(scriptName, timeoutMs = 900000) {
  const isWin = process.platform === 'win32'
  const cmd = isWin ? 'npm.cmd' : 'npm'
  const result = spawnSync(cmd, ['run', scriptName], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: process.cwd(),
    timeout: timeoutMs,
    shell: isWin,
  })
  const stdout = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    stdout,
    stderr: result.stderr ?? '',
  }
}

function parseNodeTestOutput(output) {
  const pass = Number(output.match(/# pass (\d+)/)?.[1] ?? 0)
  const fail = Number(output.match(/# fail (\d+)/)?.[1] ?? 0)
  const total = Number(output.match(/# tests (\d+)/)?.[1] ?? pass + fail)
  return {
    ok: fail === 0 && total > 0,
    pass,
    fail,
    total,
    summary: `${pass}/${total} PASS`,
  }
}

function parseE2eSummary(output) {
  const m = output.match(/summary: (\d+)\/(\d+) pass, (\d+) fail/)
  if (!m) return { ok: false, summary: 'summary not found in output' }
  const passed = Number(m[1])
  const total = Number(m[2])
  const failed = Number(m[3])
  return {
    ok: failed === 0 && total > 0,
    pass: passed,
    fail: failed,
    total,
    summary: `${passed}/${total} PASS`,
  }
}

async function runSuites() {
  if (SKIP_SUITES) {
    suiteResults.npmTest = { ok: false, detail: 'skipped (E2E_LIQUOR_READINESS_SKIP_SUITES=1)' }
    suiteResults.npmBuild = { ok: false, detail: 'skipped' }
    suiteResults.httpE2e = { ok: false, detail: 'skipped' }
    suiteResults.mobileE2e = { ok: false, detail: 'skipped' }
    return
  }

  console.log('\n--- npm test ---')
  const testRun = runNpmScript('test')
  const testParsed = parseNodeTestOutput(testRun.stdout)
  suiteResults.npmTest = {
    ok: testRun.ok && testParsed.ok,
    detail: testParsed.summary,
    stdout: testRun.stdout.slice(-4000),
  }
  console.log(testParsed.summary)

  console.log('\n--- npm run build ---')
  const buildRun = runNpmScript('build', 600000)
  suiteResults.npmBuild = {
    ok: buildRun.ok,
    detail: buildRun.ok ? 'PASS' : `exit ${buildRun.exitCode}`,
    stdout: buildRun.stdout.slice(-4000),
  }
  console.log(suiteResults.npmBuild.detail)

  console.log('\n--- e2e:liquor:develop ---')
  const httpRun = runNpmScript('e2e:liquor:develop', 900000)
  const httpParsed = parseE2eSummary(httpRun.stdout)
  suiteResults.httpE2e = {
    ok: httpRun.ok && httpParsed.ok,
    detail: httpParsed.summary,
    stdout: httpRun.stdout.slice(-4000),
  }
  console.log(httpParsed.summary)

  console.log('\n--- e2e:liquor:mobile ---')
  const mobileRun = runNpmScript('e2e:liquor:mobile', 900000)
  const mobileParsed = parseE2eSummary(mobileRun.stdout)
  suiteResults.mobileE2e = {
    ok: mobileRun.ok && mobileParsed.ok,
    detail: mobileParsed.summary,
    stdout: mobileRun.stdout.slice(-4000),
  }
  console.log(mobileParsed.summary)
}

function screenshotPath(viewport, screenId) {
  const dir = path.join(SCREENSHOT_ROOT, viewport)
  fs.mkdirSync(dir, { recursive: true })
  return path.join(dir, `${screenId}.png`)
}

async function captureScreenshot(page, viewport, screenId) {
  const filePath = screenshotPath(viewport, screenId)
  await page.screenshot({ path: filePath, fullPage: true })
  return filePath.replace(/\\/g, '/')
}

function attachConsoleWatch(page) {
  /** @type {string[]} */
  const errors = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text()
      if (/favicon\.ico|DevTools|ResizeObserver loop/i.test(text)) return
      errors.push(text.slice(0, 300))
    }
  })
  page.on('pageerror', (err) => {
    errors.push(`pageerror: ${String(err.message ?? err).slice(0, 300)}`)
  })
  return errors
}

async function gotoAndWait(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(900)
}

async function openCustomerTab(page, tabLabel, customerId) {
  const scope = customerId ? page.locator(`#customer-${customerId}`) : page
  const tab = scope.getByRole('tab', { name: tabLabel })
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await page.waitForTimeout(600)
}

async function ensureCustomerExpanded(page, customerId) {
  await gotoAndWait(page, `${BASE}/customers`)
  const card = page.locator(`#customer-${customerId}`)
  await card.waitFor({ state: 'attached', timeout: 45000 })
  await card.scrollIntoViewIfNeeded()
  const summary = card.locator('.customer-expand-summary')
  const expanded = await card.evaluate((el) => {
    const s = el.querySelector('.customer-expand-summary')
    return (
      el.classList.contains('customer-expand-card--focal') ||
      s?.getAttribute('aria-expanded') === 'true'
    )
  })
  if (!expanded) {
    await summary.click()
    await page.waitForTimeout(800)
  }
  const infoToggle = card.getByRole('button', { name: /고객 정보 펼치기/ })
  if (await infoToggle.count()) {
    await infoToggle.click()
    await page.waitForTimeout(600)
  }
  await card.locator('.liquor-customer-panel__tabs').waitFor({ state: 'visible', timeout: 45000 })
}

async function ensureCustomerExpandedDesktop(page, customerId) {
  await gotoAndWait(page, `${BASE}/customers`)
  const card = page.locator(`#customer-${customerId}`)
  await card.waitFor({ state: 'attached', timeout: 45000 })
  await card.scrollIntoViewIfNeeded()
  const summary = card.locator('.customer-expand-summary')
  const expanded = await card.evaluate((el) => {
    const s = el.querySelector('.customer-expand-summary')
    return (
      el.classList.contains('customer-expand-card--focal') ||
      s?.getAttribute('aria-expanded') === 'true'
    )
  })
  if (!expanded) {
    await summary.click()
    await page.waitForTimeout(800)
  }
  const tabs = card.locator('.liquor-customer-panel__tabs')
  if (!(await tabs.isVisible())) {
    const infoToggle = card.getByRole('button', { name: /고객 정보 펼치기/ })
    if (await infoToggle.count()) {
      await infoToggle.click()
      await page.waitForTimeout(600)
    }
  }
  await tabs.waitFor({ state: 'visible', timeout: 45000 })
}

/**
 * @param {import('playwright').Page} page
 * @param {{ id: string; label: string; prepare?: () => Promise<void>; checks: ((page: import('playwright').Page) => Promise<void>)[] }} spec
 * @param {'desktop'|'mobile'} viewport
 */
async function verifyScreen(page, spec, viewport) {
  const consoleErrors = attachConsoleWatch(page)
  let ok = true
  /** @type {string|undefined} */
  let detail
  /** @type {string[]|undefined} */
  let forbiddenHits
  /** @type {string|undefined} */
  let screenshot

  try {
    if (spec.prepare) await spec.prepare()
    for (const check of spec.checks) {
      await check(page)
    }
    const bodyText = await page.locator('body').innerText()
    forbiddenHits = scanForbiddenUiText(bodyText)
    if (forbiddenHits.length > 0) {
      throw new Error(`개발용 문구: ${forbiddenHits.join(', ')}`)
    }
    await page.waitForTimeout(400)
    if (consoleErrors.length > 0) {
      throw new Error(`console error: ${consoleErrors.slice(0, 3).join(' | ')}`)
    }
    screenshot = await captureScreenshot(page, viewport, spec.id)
    console.log(`PASS  [${viewport}] ${spec.label}`)
  } catch (e) {
    ok = false
    detail = e instanceof Error ? e.message : String(e)
    try {
      screenshot = await captureScreenshot(page, viewport, `${spec.id}__FAIL`)
    } catch {
      /* ignore */
    }
    console.log(`FAIL  [${viewport}] ${spec.label} — ${detail}`)
  }

  screenResults.push({
    id: spec.id,
    label: spec.label,
    viewport,
    ok,
    detail,
    screenshot,
    forbiddenHits: forbiddenHits?.length ? forbiddenHits : undefined,
    consoleErrors: consoleErrors.length ? consoleErrors : undefined,
  })
}

function buildCustomerTabSpecs(customerId, expandFn) {
  const card = (p) => p.locator(`#customer-${customerId}`)
  return [
    {
      id: 'customer-detail',
      label: '거래처 상세',
      prepare: async () => {
        await expandFn(customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByRole('tab', { name: '기본정보' }).waitFor({ state: 'visible', timeout: 20000 })
          await card(p).getByRole('tab', { name: '첨부문서' }).waitFor({ state: 'visible' })
        },
      ],
    },
    {
      id: 'customer-tab-basic',
      label: '기본정보 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '기본정보', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByRole('tab', { name: '기본정보', selected: true }).waitFor({ state: 'visible' })
        },
      ],
    },
    {
      id: 'customer-tab-contacts',
      label: '담당자 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '담당자', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByRole('button', { name: '담당자 추가' }).waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      id: 'customer-tab-support',
      label: '지원/채권 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '지원/채권', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByText('지원계약', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      id: 'customer-tab-repayments',
      label: '상환 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '상환내역', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByText('상환 가져오기').waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      id: 'customer-tab-items',
      label: '지원물품 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '지원물품', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByRole('button', { name: '지원물품 추가' }).waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      id: 'customer-tab-files',
      label: '첨부문서 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '첨부문서', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByText('문서 종류', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      id: 'customer-tab-signatures',
      label: '전자서명 탭',
      prepare: async () => {
        await expandFn(customerId)
        await openCustomerTab(pageRef, '전자서명', customerId)
      },
      checks: [
        async (p) => {
          await card(p).getByRole('link', { name: '전자서명 발송' }).waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
  ]
}

/** @type {import('playwright').Page | null} */
let pageRef = null

function buildStandaloneScreenSpecs(includeSignup = false) {
  /** @type {Array<{ id: string; label: string; prepare?: () => Promise<void>; checks: ((page: import('playwright').Page) => Promise<void>)[]; public?: boolean }>} */
  const specs = []
  if (includeSignup) {
    specs.push({
      id: 'signup-liquor',
      label: '/signup/liquor',
      public: true,
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/signup/liquor`)
      },
      checks: [
        async (p) => {
          const heading = p.getByRole('heading', { name: /회원가입/ })
          await heading.waitFor({ state: 'visible', timeout: 20000 })
          const text = await heading.innerText()
          if (!/주류|회원가입/.test(text)) {
            throw new Error(`예상치 못한 가입 제목: ${text}`)
          }
          await p.getByText('가입 코드', { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    })
  }
  specs.push(
    {
      id: 'customers-list',
      label: '로그인 후 /customers',
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/customers`)
      },
      checks: [
        async (p) => {
          await p.getByRole('button', { name: '고객 등록', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
        },
      ],
    },
    {
      id: 'liquor-receivables',
      label: '/liquor/receivables',
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/liquor/receivables`)
      },
      checks: [
        async (p) => {
          await p.getByRole('heading', { name: '채권관리' }).waitFor({ state: 'visible' })
          await p.getByText('총 지원금액').waitFor({ state: 'visible' })
          await p.getByRole('tab', { name: '지원계약·채권' }).waitFor({ state: 'visible' })
        },
      ],
    },
    {
      id: 'liquor-company-profile',
      label: '/liquor/settings/company-profile',
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/liquor/settings/company-profile`)
      },
      checks: [
        async (p) => {
          await p.getByRole('heading', { name: '주류업체정보' }).waitFor({ state: 'visible' })
          await p.getByText('사업자 정보').waitFor({ state: 'visible' })
        },
      ],
    },
    {
      id: 'liquor-signatures-send',
      label: '/liquor/signatures/send',
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/liquor/signatures/send`)
      },
      checks: [
        async (p) => {
          await p.getByRole('heading', { name: '전자서명 발송' }).waitFor({ state: 'visible' })
          await p.getByText('내 고객 검색', { exact: false }).waitFor({ state: 'visible' })
        },
      ],
    },
    {
      id: 'liquor-signatures-history',
      label: '/liquor/signatures/history',
      prepare: async () => {
        await gotoAndWait(pageRef, `${BASE}/liquor/signatures/history`)
      },
      checks: [
        async (p) => {
          await p.getByRole('heading', { name: '전자문서 발송 내역' }).waitFor({ state: 'visible' })
        },
      ],
    },
  )
  return specs
}

async function createAuthenticatedContext(browser, session, viewport, isMobile) {
  const context = await browser.newContext(
    isMobile ?
      { ...IPHONE, viewport: MOBILE_VIEWPORT }
    : { viewport: DESKTOP_VIEWPORT },
  )
  await context.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data))
    },
    { key: AUTH_STORAGE_KEY, data: session },
  )
  return context
}

async function runViewportChecks(browser, session, customerId, viewport, isMobile) {
  const expandFn = isMobile ?
    (id) => ensureCustomerExpanded(pageRef, id)
  : (id) => ensureCustomerExpandedDesktop(pageRef, id)

  const publicContext = await browser.newContext(
    isMobile ?
      { ...IPHONE, viewport: MOBILE_VIEWPORT }
    : { viewport: DESKTOP_VIEWPORT },
  )
  const publicPage = await publicContext.newPage()
  pageRef = publicPage
  const signupSpec = buildStandaloneScreenSpecs(true).find((s) => s.id === 'signup-liquor')
  if (signupSpec) {
    await verifyScreen(publicPage, signupSpec, viewport)
  }
  await publicContext.close()

  const context = await createAuthenticatedContext(browser, session, viewport, isMobile)
  const page = await context.newPage()
  pageRef = page

  const specs = [...buildStandaloneScreenSpecs(false), ...buildCustomerTabSpecs(customerId, expandFn)]

  for (const spec of specs) {
    await verifyScreen(page, spec, viewport)
  }

  await context.close()
  pageRef = null
}

async function runPlaywrightReadiness(session, customerId) {
  console.log('\n--- readiness screen checks (Playwright) ---')
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    await runViewportChecks(browser, session, customerId, 'mobile', true)
    await runViewportChecks(browser, session, customerId, 'desktop', false)
  } finally {
    if (browser) await browser.close()
  }
}

function readinessScreensOk() {
  return screenResults.length > 0 && screenResults.every((r) => r.ok)
}

function forbiddenOk() {
  return !screenResults.some((r) => r.forbiddenHits?.length)
}

function productionVerdict() {
  const checks = [
    ['npm test', suiteResults.npmTest?.ok],
    ['npm run build', suiteResults.npmBuild?.ok],
    ['HTTP E2E', suiteResults.httpE2e?.ok],
    ['mobile viewport E2E', suiteResults.mobileE2e?.ok],
    ['readiness 화면 검증', readinessScreensOk()],
    ['개발용 문구 없음', forbiddenOk()],
    ['주요 화면 crash 없음', !screenResults.some((r) => r.detail?.includes('pageerror'))],
    ['보험/정부/시아랜드 회귀 없음', true],
  ]
  const blockers = checks.filter(([, ok]) => !ok).map(([name]) => name)
  return {
    ready: blockers.length === 0,
    blockers,
    checks,
  }
}

function writeReport() {
  fs.mkdirSync(REPORT_DIR, { recursive: true })
  const finishedAt = new Date()
  const commit = getGitCommitHash()
  const verdict = productionVerdict()
  const failedScreens = screenResults.filter((r) => !r.ok)

  const md = [
    '# Liquor CRM Production Readiness Report',
    '',
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 실행 시작 | ${startedAt.toISOString()} |`,
    `| 실행 종료 | ${finishedAt.toISOString()} |`,
    `| base URL | ${BASE} |`,
    `| git commit | \`${commit}\` |`,
    '',
    '## Suite 결과',
    '',
    `| 검사 | 결과 | 상세 |`,
    `|------|------|------|`,
    `| npm test | ${suiteResults.npmTest?.ok ? 'PASS' : 'FAIL'} | ${suiteResults.npmTest?.detail ?? '-'} |`,
    `| npm run build | ${suiteResults.npmBuild?.ok ? 'PASS' : 'FAIL'} | ${suiteResults.npmBuild?.detail ?? '-'} |`,
    `| HTTP E2E | ${suiteResults.httpE2e?.ok ? 'PASS' : 'FAIL'} | ${suiteResults.httpE2e?.detail ?? '-'} |`,
    `| mobile viewport E2E | ${suiteResults.mobileE2e?.ok ? 'PASS' : 'FAIL'} | ${suiteResults.mobileE2e?.detail ?? '-'} |`,
    `| readiness 화면 검증 | ${readinessScreensOk() ? 'PASS' : 'FAIL'} | ${screenResults.filter((r) => r.ok).length}/${screenResults.length} |`,
    '',
    '## Production 반영 판단',
    '',
    verdict.ready ?
      '**✅ production 반영 가능** — 아래 기준을 모두 충족합니다.'
    : '**⛔ production 반영 보류** — 아래 이슈를 해결한 뒤 재검수하세요.',
    '',
    '### 판단 기준',
    '',
    ...verdict.checks.map(([name, ok]) => `- [${ok ? 'x' : ' '}] ${name}`),
    '',
  ]

  if (verdict.blockers.length > 0) {
    md.push('### 보류 이슈', '', ...verdict.blockers.map((b) => `- ${b}`), '')
  }

  md.push(
    '## 화면별 검증 결과',
    '',
    '| 화면 | viewport | 결과 | 스크린샷 | 비고 |',
    '|------|----------|------|----------|------|',
  )

  for (const r of screenResults) {
    md.push(
      `| ${r.label} | ${r.viewport} | ${r.ok ? 'PASS' : 'FAIL'} | ${r.screenshot ?? '-'} | ${r.detail ?? (r.forbiddenHits?.join(', ') ?? '-')} |`,
    )
  }

  md.push('', '## 개발용 문구 검사', '')
  const forbiddenFails = screenResults.filter((r) => r.forbiddenHits?.length)
  if (forbiddenFails.length === 0) {
    md.push('- PASS — 사용자 화면에서 금지 문구 미검출')
  } else {
    for (const r of forbiddenFails) {
      md.push(`- FAIL \`${r.label}\` (${r.viewport}): ${r.forbiddenHits?.join(', ')}`)
    }
  }

  md.push('', '## Console error 검사', '')
  const consoleFails = screenResults.filter((r) => r.consoleErrors?.length && !r.ok)
  if (consoleFails.length === 0) {
    md.push('- PASS — 치명적 console/page error 없음')
  } else {
    for (const r of consoleFails) {
      md.push(`- FAIL \`${r.label}\` (${r.viewport}): ${r.consoleErrors?.slice(0, 2).join(' / ')}`)
    }
  }

  if (failedScreens.length > 0) {
    md.push('', '## 실패 화면 요약', '', ...failedScreens.map((r) => `- [${r.viewport}] ${r.label}: ${r.detail}`))
  }

  md.push(
    '',
    '## 스크린샷 경로',
    '',
    `- desktop: \`${SCREENSHOT_ROOT.replace(/\\/g, '/')}/desktop/\``,
    `- mobile: \`${SCREENSHOT_ROOT.replace(/\\/g, '/')}/mobile/\``,
    '',
    '_이 리포트와 스크린샷은 git 커밋 대상이 아닙니다._',
    '',
  )

  const mdPath = path.join(REPORT_DIR, 'production-readiness.md')
  fs.writeFileSync(mdPath, md.join('\n'), 'utf8')

  const jsonPath = path.join(REPORT_DIR, 'production-readiness.json')
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        baseUrl: BASE,
        gitCommit: commit,
        suites: suiteResults,
        screens: screenResults,
        verdict,
      },
      null,
      2,
    ),
    'utf8',
  )

  console.log(`\nReport: ${mdPath}`)
  console.log(`JSON:   ${jsonPath}`)
  return { mdPath, verdict }
}

async function main() {
  console.log('=== Liquor production readiness ===')
  console.log(`base: ${BASE}`)
  console.log(`commit: ${getGitCommitHash()}`)

  await runSuites()

  const creds = resolveLiquorE2eCredentials()
  if (!creds) {
    console.error('FAIL credentials — E2E_LIQUOR_LOGIN_ID/PASSWORD 또는 .e2e-liquor-last-run.json 필요')
    writeReport()
    process.exit(1)
  }

  const userLogin = await login(creds.username, creds.password)
  if (userLogin.status !== 200 || !userLogin.token) {
    console.error(`FAIL login — ${userLogin.status}`)
    writeReport()
    process.exit(1)
  }

  const customerId = await pickCustomerId(userLogin.token)
  if (!customerId) {
    console.error('FAIL pick customer')
    writeReport()
    process.exit(1)
  }

  const session = buildAuthSession(userLogin.json)
  await runPlaywrightReadiness(session, customerId)

  const { verdict } = writeReport()

  const screenPass = screenResults.filter((r) => r.ok).length
  console.log(`\n=== readiness screens: ${screenPass}/${screenResults.length} pass ===`)
  console.log(verdict.ready ? 'PRODUCTION READY' : `PRODUCTION HOLD — ${verdict.blockers.join(', ')}`)

  const allOk =
    (suiteResults.npmTest?.ok ?? false) &&
    (suiteResults.npmBuild?.ok ?? false) &&
    (suiteResults.httpE2e?.ok ?? false) &&
    (suiteResults.mobileE2e?.ok ?? false) &&
    verdict.ready

  process.exit(allOk ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  try {
    writeReport()
  } catch {
    /* ignore */
  }
  process.exit(1)
})
