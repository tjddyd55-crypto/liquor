/**
 * Liquor CRM — 모바일 viewport Playwright E2E (시각·레이아웃 검증).
 *
 * env: E2E_LIQUOR_BASE_URL, E2E_LIQUOR_LOGIN_ID/E2E_LIQUOR_PASSWORD
 *      또는 .e2e-liquor-last-run.json (HTTP E2E 후 생성)
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium, devices } from 'playwright'
import {
  AUTH_STORAGE_KEY,
  buildAuthSession,
  liquorBaseUrl,
  login,
  pickCustomerId,
  resolveLiquorE2eCredentials,
} from './e2eLiquorShared.mjs'

const BASE = liquorBaseUrl()
const VIEWPORT = { width: 390, height: 844 }
const VIEWPORT_ALT = { width: 375, height: 812 }
const IPHONE = devices['iPhone 14']

async function createMobileContext(browser, session, viewport) {
  const context = await browser.newContext({
    ...IPHONE,
    viewport,
  })
  await context.addInitScript(
    ({ key, data }) => {
      localStorage.setItem(key, JSON.stringify(data))
    },
    { key: AUTH_STORAGE_KEY, data: session },
  )
  return context
}
const SCREENSHOT_DIR = '.e2e-liquor-mobile-screenshots'

/** 사용자 화면에 노출되면 안 되는 개발용 문구 */
const FORBIDDEN_VISIBLE = [
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
]

/** @type {{ ok: boolean; name: string; detail?: string }[]} */
const results = []

function pass(name, detail) {
  results.push({ ok: true, name, detail })
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name, detail) {
  results.push({ ok: false, name, detail })
  console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
}

function summary() {
  const failed = results.filter((r) => !r.ok)
  console.log(`\n=== mobile viewport summary: ${results.length - failed.length}/${results.length} pass, ${failed.length} fail ===`)
  console.log(`viewport primary: ${VIEWPORT.width}x${VIEWPORT.height}`)
}

async function captureFailure(page, label) {
  try {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
    const safe = label.replace(/[^\w\-]+/g, '_').slice(0, 80)
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${safe}.png`), fullPage: true })
  } catch {
    /* ignore */
  }
}

async function assertNoForbiddenVisible(page) {
  const text = await page.locator('body').innerText()
  for (const term of FORBIDDEN_VISIBLE) {
    if (text.includes(term)) {
      throw new Error(`개발용 문구 노출: "${term}"`)
    }
  }
}

async function assertNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth - doc.clientWidth
  })
  if (overflow > 8) {
    throw new Error(`가로 overflow ${overflow}px`)
  }
}

async function assertSingleColumnTenantGrid(page) {
  const cols = await page.evaluate(() => {
    const grid = document.querySelector('.liquor-tenant-settings__grid')
    if (!grid) return null
    return window.getComputedStyle(grid).gridTemplateColumns
  })
  if (cols && cols !== 'none') {
    const tracks = cols.split(' ').filter(Boolean)
    if (tracks.length > 1) {
      throw new Error(`주류업체정보 그리드 다열: ${cols}`)
    }
  }
}

async function assertSingleColumnFormGrid(page) {
  const cols = await page.evaluate(() => {
    const grid = document.querySelector('.liquor-customer-form-grid')
    if (!grid) return null
    const style = window.getComputedStyle(grid)
    return style.gridTemplateColumns
  })
  if (cols && cols !== 'none' && !cols.startsWith('1fr') && !cols.includes('1fr')) {
    const onlyOne = cols.split(' ').filter(Boolean).length <= 1
    if (!onlyOne) {
      throw new Error(`폼 그리드 다열: ${cols}`)
    }
  }
}

async function checkScreen(page, name, checks) {
  try {
    await assertNoForbiddenVisible(page)
    await assertNoHorizontalOverflow(page)
    for (const fn of checks) {
      await fn(page)
    }
    pass(name)
  } catch (e) {
    await captureFailure(page, name)
    fail(name, e instanceof Error ? e.message : String(e))
  }
}

async function gotoAndWait(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(800)
}

async function openCustomerTab(page, tabLabel) {
  const tab = page.getByRole('tab', { name: tabLabel })
  await tab.scrollIntoViewIfNeeded()
  await tab.click()
  await page.waitForTimeout(500)
}

async function ensureCustomerExpanded(page, customerId) {
  await gotoAndWait(page, `${BASE}/customers`)
  const card = page.locator(`[data-customer-id="${customerId}"], [data-customer-card-id="${customerId}"]`).first()
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
  await page.locator('.liquor-customer-panel__tabs').waitFor({ state: 'visible', timeout: 45000 })
}

async function runMobileFlow(page, customerId) {
  await checkScreen(page, 'mobile: CRM 고객 목록', [
    async (p) => {
      await p.getByRole('button', { name: '고객 등록', exact: true }).waitFor({ state: 'visible', timeout: 20000 })
    },
  ])

  await ensureCustomerExpanded(page, customerId)

  await checkScreen(page, 'mobile: 거래처 상세 탭바', [
    async (p) => {
      await p.getByRole('tab', { name: '기본정보' }).waitFor({ state: 'visible' })
      await p.getByRole('tab', { name: '첨부문서' }).waitFor({ state: 'visible' })
    },
  ])

  const tabChecks = [
    { tab: '기본정보', expectText: '기본정보', extra: [assertSingleColumnFormGrid] },
    { tab: '담당자', expectText: '담당자 추가', extra: [] },
    { tab: '지원/채권', expectText: '지원계약', extra: [] },
    {
      tab: '상환내역',
      expectText: '상환',
      extra: [
        async (p) => {
          await p.getByText('상환 가져오기').waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    { tab: '지원물품', expectText: '지원물품 추가', extra: [] },
    {
      tab: '첨부문서',
      expectText: '첨부',
      extra: [
        async (p) => {
          await p.getByText('문서 종류').waitFor({ state: 'visible', timeout: 15000 })
        },
      ],
    },
    {
      tab: '전자서명',
      expectText: '전자서명 발송',
      extra: [],
    },
  ]

  for (const { tab, expectText, extra } of tabChecks) {
    await openCustomerTab(page, tab)
    await checkScreen(page, `mobile: 거래처 탭 — ${tab}`, [
      async (p) => {
        await p.getByText(expectText, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 })
      },
      ...extra,
    ])
  }

  await gotoAndWait(page, `${BASE}/liquor/receivables`)
  await checkScreen(page, 'mobile: 채권관리', [
    async (p) => {
      await p.getByRole('heading', { name: '채권관리' }).waitFor({ state: 'visible' })
      await p.getByText('총 지원금액').waitFor({ state: 'visible' })
      await p.getByRole('tab', { name: '지원계약·채권' }).waitFor({ state: 'visible' })
    },
  ])

  await gotoAndWait(page, `${BASE}/liquor/settings/company-profile`)
  await checkScreen(page, 'mobile: 주류업체정보', [
    async (p) => {
      await p.getByRole('heading', { name: '주류업체정보' }).waitFor({ state: 'visible' })
      await p.getByText('사업자 정보').waitFor({ state: 'visible' })
      await assertSingleColumnTenantGrid(p)
    },
  ])

  await gotoAndWait(page, `${BASE}/liquor/signatures/send`)
  await checkScreen(page, 'mobile: 전자서명 발송', [
    async (p) => {
      await p.getByRole('heading', { name: '전자서명 발송' }).waitFor({ state: 'visible' })
      await p.getByText('내 고객 검색', { exact: false }).waitFor({ state: 'visible' })
    },
  ])
}

async function main() {
  pass('target', BASE)

  const healthRes = await fetch(`${BASE}/backend/health`)
  if (healthRes.status === 200) pass('backend health', '200')
  else fail('backend health', String(healthRes.status))

  const signupRes = await fetch(`${BASE}/signup/liquor`)
  if (signupRes.status === 200) pass('signup liquor page', '200')
  else fail('signup liquor page', String(signupRes.status))

  const creds = resolveLiquorE2eCredentials()
  if (!creds) {
    fail('liquor test credentials', 'E2E_LIQUOR_LOGIN_ID/PASSWORD 또는 .e2e-liquor-last-run.json 필요')
    summary()
    process.exit(1)
  }
  pass('liquor test credentials', creds.source)

  const userLogin = await login(creds.username, creds.password)
  if (userLogin.status !== 200 || !userLogin.token) {
    fail('liquor user login', `${userLogin.status} ${userLogin.json?.message ?? ''}`)
    summary()
    process.exit(1)
  }
  pass('liquor user login', creds.username)

  const crmIndustry =
    userLogin.json?.user?.crm_industry_code ?? userLogin.json?.user?.crmIndustryCode ?? ''
  if (String(crmIndustry).toLowerCase() === 'liquor') pass('session crm industry', 'liquor')
  else fail('session crm industry', String(crmIndustry || '(empty)'))

  const customerId = await pickCustomerId(userLogin.token)
  if (!customerId) {
    fail('pick customer', '고객 없음')
    summary()
    process.exit(1)
  }
  pass('pick customer', String(customerId))

  const session = buildAuthSession(userLogin.json)

  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const context = await createMobileContext(browser, session, VIEWPORT)
    const page = await context.newPage()

    await gotoAndWait(page, `${BASE}/customers`)
    await runMobileFlow(page, customerId)

    // 대표 보조 viewport — 목록·상세만 스모크
    const contextAlt = await createMobileContext(browser, session, VIEWPORT_ALT)
    const pageAlt = await contextAlt.newPage()
    await gotoAndWait(pageAlt, `${BASE}/customers`)
    await checkScreen(pageAlt, 'mobile 375px: CRM 고객 목록', [
      async (p) => {
        await p.getByRole('button', { name: '고객 등록', exact: true }).waitFor({ state: 'visible' })
      },
    ])
    await gotoAndWait(pageAlt, `${BASE}/customers`)
    await ensureCustomerExpanded(pageAlt, customerId)
    await checkScreen(pageAlt, 'mobile 375px: 거래처 상세', [
      async (p) => {
        await p.getByRole('tab', { name: '기본정보' }).waitFor({ state: 'visible' })
      },
    ])
    await contextAlt.close()
    await context.close()
  } catch (e) {
    fail('playwright launch', e instanceof Error ? e.message : String(e))
  } finally {
    if (browser) await browser.close()
  }

  summary()
  process.exit(results.some((r) => !r.ok) ? 1 : 0)
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
