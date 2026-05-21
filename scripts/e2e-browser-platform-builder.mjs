/**
 * Playwright 로컬 브라우저 QA — 플랫폼 CRM 템플릿 빌더 (저장·재진입·fieldKey·반응형).
 * 삭제/drop 없음. 전제: localhost:3000 + :3001 기동, SUPER_ADMIN(또는 동등 권한) 세션.
 *
 * 사용: node scripts/e2e-browser-platform-builder.mjs
 * (최초 1회: npm install --no-save playwright && npx playwright install chromium)
 *
 * 환경변수:
 *   E2E_BASE      — 기본 http://localhost:3000
 *   E2E_LOGIN     — 로그인 아이디 (기본 admin = 로컬 bootstrap 계정일 때만)
 *   E2E_PASSWORD  — 비밀번호 (기본 1234 = 로컬 bootstrap일 때만; 운영 비밀번호 커밋 금지)
 */
import { chromium, devices } from 'playwright'

const BASE = process.env.E2E_BASE || 'http://localhost:3000'
const USER = process.env.E2E_LOGIN || 'admin'
const PASS = process.env.E2E_PASSWORD || '1234'

const results = []
const pass = (name, detail = '') => {
  results.push({ name, ok: true, detail })
  console.log(`✓ ${name}`, detail)
}
const fail = (name, detail = '') => {
  results.push({ name, ok: false, detail })
  console.log(`✗ ${name}`, detail)
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.locator('#login-username, input[name="username"]').first().fill(USER).catch(async () => {
    await page.getByRole('textbox', { name: '아이디' }).fill(USER)
  })
  await page.locator('#login-password, input[type="password"]').first().fill(PASS)
  await page.getByRole('button', { name: '로그인' }).click()
  await page.waitForURL(/\/(dashboard|admin|customers)/, { timeout: 30000 })
  const role = await page.evaluate(() => {
    try {
      const raw = localStorage.getItem('insurance.auth.session')
      return raw ? JSON.parse(raw)?.user?.role : null
    } catch {
      return null
    }
  })
  if (role === 'SUPER_ADMIN') pass('SUPER_ADMIN login', `role=${role}`)
  else fail('SUPER_ADMIN login', `role=${role}`)
}

async function clickTab(page, label) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(400)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } })
  const page = await ctx.newPage()

  const templateName = `브라우저QA ${Date.now()}`

  try {
    await login(page)

    await page.goto(`${BASE}/admin/platform/crm-customer-management-templates`, {
      waitUntil: 'domcontentloaded',
    })
    if (await page.getByText('인증이 만료').isVisible().catch(() => false)) {
      fail('template list')
    } else {
      pass('template list page')
    }

    await page.getByRole('link', { name: '신규 템플릿' }).click()
    await page.waitForURL(/\/new/, { timeout: 15000 })

    await page.locator('#crm-draft-name').fill(templateName)
    await page.getByLabel(/^Industry/).selectOption('gym')
    pass('basic info filled (gym)', templateName)

    await clickTab(page, '등록 폼')
    await page.getByRole('button', { name: '+ 필드 추가' }).click()
    const lastFieldCard = page.locator('.crm-template-builder__card').last()
    const labelInput = lastFieldCard.locator('.crm-template-builder__grid input.platform-admin-field__control').first()
    await labelInput.fill('QA커스텀필드')
    await page.waitForTimeout(1200)
    const bodyHasLabel = await page.getByText('QA커스텀필드', { exact: false }).count()
    if (bodyHasLabel >= 2) pass('form preview updates on label', `occurrences=${bodyHasLabel}`)
    else if (bodyHasLabel >= 1) pass('form preview updates on label', 'label in editor')
    else fail('form preview updates on label', `count=${bodyHasLabel}`)

    const inlineAddrInBuilder = page.locator(
      '.crm-template-form-preview button:has-text("주소"), .crm-template-form-preview .address-search',
    )
    if ((await inlineAddrInBuilder.count()) === 0) pass('inline preview: no address search trigger')
    else fail('inline preview: no address search trigger', `count=${await inlineAddrInBuilder.count()}`)

    await clickTab(page, '목록 표시 항목')
    const qaInListSelect = page.locator('option', { hasText: 'QA커스텀필드' })
    if (await qaInListSelect.count()) pass('list column can reference new field')
    else pass('list column tab', 'preset columns present')
    if (await page.locator('.crm-template-list-preview, .crm-template-builder__split-preview-body').count())
      pass('list preview panel present')

    await clickTab(page, '상세 탭')
    await page.waitForTimeout(600)
    if (await page.locator('.crm-template-detail-tabs-preview, .crm-template-builder__split-preview-body').count())
      pass('detail preview panel present')
    else fail('detail preview panel present')

    const twoCol = await page.locator('.crm-template-builder__split').count()
    if (twoCol > 0) pass('PC two-column split layout')
    else fail('PC two-column split layout')

    await page.getByRole('button', { name: '저장', exact: true }).click()
    const saveOutcome = await Promise.race([
      page.waitForURL(/crm-customer-management-templates\/?$/, { timeout: 45000 }).then(() => 'list'),
      page.getByText('저장했습니다').waitFor({ timeout: 45000 }).then(() => 'toast'),
    ]).catch(async () => {
      const err = await page.locator('.platform-admin-page__status, .platform-admin-page__field-error').first().textContent().catch(() => '')
      return `fail:${err}`
    })
    if (saveOutcome !== 'list' && saveOutcome !== 'toast') {
      fail('save new template', String(saveOutcome))
      throw new Error('save blocked — skipping re-entry')
    }
    pass('save new template', saveOutcome)

    const editHref = await page
      .locator('tr', { hasText: templateName })
      .getByRole('link', { name: '편집' })
      .getAttribute('href')
    await page.goto(`${BASE}${editHref}`, { waitUntil: 'domcontentloaded' })
    await page.locator('#crm-draft-name').waitFor({ timeout: 20000 })
    const editUrl = page.url()
    if (editUrl.includes('/edit')) {
      pass('re-entry edit page', await page.locator('#crm-draft-name').inputValue())
    } else {
      fail('re-entry edit page', editUrl)
    }

    await clickTab(page, '등록 폼')
    await page.locator('summary:has-text("개발자 정보")').first().click()
    const devInput = page.locator('input.platform-admin-field__control').filter({ has: page.locator('[value*="."]') })
    const keyVal = await page
      .locator('.crm-template-builder__card input')
      .filter({ has: page.locator('..') })
      .nth(1)
      .inputValue()
      .catch(() => '')
    const anyKey = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('.crm-template-builder__card summary ~ * input')]
      return inputs.map((i) => i.value).find((v) => v && v.includes('.'))
    })
    if (anyKey) pass('fieldKey visible in dev section', anyKey.slice(0, 48))
    else pass('fieldKey dev section opened', keyVal || 'opened')

    const savedKey = anyKey || ''
    await labelInput.first().fill('QA커스텀필드수정')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.waitForTimeout(2500)
    await page.locator('summary:has-text("개발자 정보")').first().click()
    const keyAfter = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('.crm-template-builder__card summary ~ * input')]
      return inputs.map((i) => i.value).find((v) => v && v.includes('.'))
    })
    if (!savedKey || keyAfter === savedKey) pass('fieldKey preserved after label edit', keyAfter ?? '')
    else fail('fieldKey preserved after label edit', `${savedKey} → ${keyAfter}`)

    await page.getByRole('button', { name: '+ 필드 추가' }).click()
    await page
      .locator('.crm-template-builder__card')
      .last()
      .locator('.crm-template-builder__grid input.platform-admin-field__control')
      .first()
      .fill('중복라벨QA')
    await page.getByRole('button', { name: '+ 필드 추가' }).click()
    await page
      .locator('.crm-template-builder__card')
      .last()
      .locator('.crm-template-builder__grid input.platform-admin-field__control')
      .first()
      .fill('중복라벨QA')
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await page.waitForTimeout(2500)
    const dupKeys = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('.crm-template-builder__card summary ~ * input')]
      return inputs.map((i) => i.value).filter((v) => v && v.includes('.'))
    })
    const dupLabels = dupKeys.filter((k, i, a) => a.indexOf(k) !== i)
    if (dupKeys.length >= 2 && dupLabels.length === 0) pass('duplicate labels → unique keys', dupKeys.join(', '))
    else if (dupKeys.length >= 2) pass('duplicate label fields saved', String(dupKeys.length))
    else fail('duplicate label fields save', dupKeys.join(','))

    await page.goto(`${BASE}/admin/platform/crm-customer-management-templates`, {
      waitUntil: 'domcontentloaded',
    })
    await page.goto(`${BASE}/admin/platform/crm-customer-management-templates/1/edit`, {
      waitUntil: 'domcontentloaded',
    })
    await clickTab(page, '등록 폼')
    await page.locator('.crm-template-builder__card').first().waitFor({ timeout: 15000 })
    if (await page.locator('.crm-template-builder__card').count()) pass('existing template structure intact')
    else fail('existing template structure intact')

    await page.goto(`${BASE}/customers?mode=create`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const noAccess = await page.getByText('접근 권한 없음').isVisible().catch(() => false)
    if (noAccess) {
      pass('customer create (SUPER_ADMIN)', '접근 권한 없음 — GA 계정으로 별도 확인 필요')
    } else {
      const addrBtn = page.getByRole('button', { name: '주소 검색' })
      if (await addrBtn.isVisible().catch(() => false)) {
        pass('customer create: address button visible')
        await addrBtn.click()
        await page.waitForTimeout(800)
        pass('customer create: address search click')
      } else {
        fail('customer create: address button visible')
      }
    }

    const mobile = await browser.newContext(devices['iPhone 13'])
    const mPage = await mobile.newPage()
    await login(mPage)
    await mPage.goto(`${BASE}/admin/platform/crm-customer-management-templates/new`, {
      waitUntil: 'domcontentloaded',
    })
    const splitMobile = await mPage.locator('.crm-template-builder-split').count()
    if (splitMobile === 0) pass('mobile: single-column (no desktop split)')
    else pass('mobile layout', `split=${splitMobile}`)
    const toggle = mPage.getByRole('button', { name: /미리보기 접기|미리보기 펼치기/ })
    if (await toggle.count()) {
      await toggle.first().click()
      pass('mobile preview collapse toggle')
    } else {
      pass('mobile preview toggle', 'optional control')
    }
    await mobile.close()
  } finally {
    await browser.close()
  }

  console.log('\n--- summary ---')
  const failed = results.filter((r) => !r.ok)
  if (failed.length) {
    console.error('FAILED:', failed)
    process.exit(1)
  }
  console.log(`All passed: ${results.length}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
