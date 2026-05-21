/**
 * 엑셀 내용을 "웹에서 직접 입력·저장"했을 때와 같은 DB 항목에 일괄 반영하는 도구입니다.
 * 엑셀 파일과 서버를 실시간 연동하지 않고, 1회 읽어서 테이블에 INSERT/UPDATE 한 뒤 끝입니다.
 *
 * 예) 구분=LIFE, 보험사명=삼성생명, 담당자=홍길동 지점장, 연락처=01022221382 한 행은
 *     담당자 열은 웹 폼과 같이 이름/직책 입력칸으로 분리(parseManagerCell).
 *     - `/company/full-save`와 동일처럼 insurance_company_master / insurance_company_contacts
 *     - 재보험사 연락처 화면과 동일처럼 insurance_contacts (manager/position/phone 분리 규칙 동일)
 *     에 들어갑니다. 인콜·전산문의 열은 같은 보험사 마스터 필드에 반영됩니다.
 *
 * 열: 구분, 보험사명, 인콜, 전산문의, 담당자, 연락처
 *
 * node server/scripts/runCleanedExcelImport.mjs [엑셀경로] [--dry-run] [--sheet=시트명] [--skip-reinsurer-contacts]
 *
 * 환경:
 * - 로컬: .env 의 DATABASE_PUBLIC_URL(또는 Public Network 연결 문자열) 권장
 * - DATABASE_URL 이 postgres.railway.internal 이면 로컬에서 실패 → Public URL로 교체
 * - 배포 컨테이너 안(RAILWAY_ENVIRONMENT)에서는 사설 URL 사용 가능
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import { coerceMeritzFireToNonLifeCategory } from '../lib/insuranceCompanyCategoryRules.js'
import { cleanPhone, parseManagerCell } from '../lib/partnerExcelParse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

function loadEnvFileIfPresent(root, filename = '.env') {
  const p = path.join(root, filename)
  if (!fs.existsSync(p)) {
    return
  }
  const raw = fs.readFileSync(p, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) {
      continue
    }
    const i = t.indexOf('=')
    if (i === -1) {
      continue
    }
    const key = t.slice(0, i).trim()
    let val = t.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = val
    }
  }
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')

/** .env 예시 자리값 제외. 로컬 PC에서는 Railway Public URL을 우선(사설 *.railway.internal 는 DNS 실패) */
function ensureDatabaseUrl() {
  const isUsable = (v) => {
    const s = String(v ?? '').trim()
    if (!s || s.includes('user:password@host')) {
      return ''
    }
    return s
  }
  let url = isUsable(process.env.DATABASE_PUBLIC_URL)
  if (!url) url = isUsable(process.env.PUBLIC_DATABASE_URL)
  if (!url) url = isUsable(process.env.DATABASE_URL)
  if (!url) url = isUsable(process.env.POSTGRES_URL)
  if (!url) url = isUsable(process.env.POSTGRES_PRISMA_URL)
  if (!url) url = isUsable(process.env.DATABASE_PRIVATE_URL)
  if (url) {
    process.env.DATABASE_URL = url
  } else if (
    !String(process.env.DATABASE_URL ?? '').trim() ||
    String(process.env.DATABASE_URL).includes('user:password@host')
  ) {
    delete process.env.DATABASE_URL
  }
}

/** @param {string | undefined} url */
function isRailwayInternalDatabaseUrl(url) {
  return /\.railway\.internal\b/i.test(String(url ?? ''))
}

/**
 * 배포된 앱 컨테이너 안이 아니면 postgres.railway.internal 은 쓸 수 없음(로컬 ENOTFOUND)
 * @param {string} url
 */
function exitIfRailwayInternalFromLocalMachine(url) {
  if (!url || !isRailwayInternalDatabaseUrl(url)) {
    return
  }
  if (process.env.RAILWAY_ENVIRONMENT) {
    return
  }
  console.error(`
[cleaned-import] DB 주소가 Railway 사설 호스트(.railway.internal)입니다.
로컬 PC에서 npm으로 실행하면 이 호스트 이름을 찾을 수 없어 ENOTFOUND가 납니다.

해결:
  Railway 웹 → 해당 Postgres → Connect(연결) → "Public Network"의 URL을 복사해
  .env 에 넣으세요. 변수 이름 예: DATABASE_PUBLIC_URL=... 또는 DATABASE_URL=...
  (Variables에만 있는 기본 DATABASE_URL이 사설용이면 Public 탭 값을 따로 복사해야 합니다.)
`)
  process.exit(1)
}

ensureDatabaseUrl()

/** @param {unknown} value */
function normalizeInsuranceCompanyCategory(value) {
  const s = String(value ?? '').trim()
  if (!s) {
    return ''
  }
  const u = s.toUpperCase().replace(/-/g, '_')
  if (u === 'NONLIFE') {
    return 'NON_LIFE'
  }
  if (u === 'LIFE' || u === 'NON_LIFE' || u === 'GENERAL') {
    return u
  }
  const lower = s.toLowerCase()
  if (lower === 'life') {
    return 'LIFE'
  }
  if (lower === 'nonlife') {
    return 'NON_LIFE'
  }
  const ko = s.replace(/\s+/g, '')
  if (/^(생명|생명보험|생보)$/.test(ko) || ko === '생명보험') {
    return 'LIFE'
  }
  if (
    /^(손해|손해보험|손보|재산|화재)$/.test(ko) ||
    ko === '손해보험' ||
    ko === '손해보험사'
  ) {
    return 'NON_LIFE'
  }
  if (/^(일반|일반보험)$/.test(ko) || ko === '일반보험') {
    return 'GENERAL'
  }
  return ''
}

/**
 * ~ 범위·콤마 뒤 내선 등: 앞쪽 구간만 잘라 전화 정규화. 휴대폰 외 유선·대표번호도 숫자만 저장.
 * 숫자 추출이 신뢰할 수 없으면 원문(trim) 유지.
 * @param {unknown} raw
 */
function normalizeStoredPhone(raw) {
  const orig = String(raw ?? '').trim()
  if (!orig) {
    return ''
  }
  const beforeWave = orig.split(/[~～]/)[0].trim()
  const firstSeg = beforeWave.split(/[,，]/)[0].trim()
  const d = cleanPhone(firstSeg)
  if (d.length >= 8 && d.length <= 11) {
    return d
  }
  if (d.length >= 5 && d.length <= 7) {
    return d
  }
  const d2 = cleanPhone(orig)
  if (d2.length >= 8 && d2.length <= 11) {
    return d2
  }
  if (d2.length >= 5 && d2.length <= 7) {
    return d2
  }
  return orig
}

/** API /insurance/contacts 와 동일: 저장·표시용 숫자만 */
function normalizePhoneNumberDigits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

async function touchContactLastUpdatedAt(client) {
  await client.query(
    `
    INSERT INTO insurance_contact_meta (meta_key, meta_value, updated_at)
    VALUES ('contact_last_updated_at', CAST(NOW() AS text), NOW())
    ON CONFLICT (meta_key)
    DO UPDATE SET meta_value = CAST(NOW() AS text), updated_at = NOW()
    `,
  )
}

/**
 * 재보험사 연락처 목록을 엑셀과 일치시킴 (기존 insurance_contacts 전량 교체)
 * @param {import('pg').PoolClient} client
 * @param {Array<{ category: string, companyName: string, managerName: string, position: string, phoneDigits: string }>} list
 */
async function replaceReinsurerContactsFromExcel(client, list) {
  await client.query(`DELETE FROM insurance_contacts`)

  const desc = '엑셀 일괄 반영'

  for (const r of list) {
    const contactId = randomUUID()
    await client.query(
      `
      INSERT INTO insurance_contacts (
        id, category, company_name, manager_name, position, phone_number, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      `,
      [contactId, r.category, r.companyName, r.managerName, r.position, r.phoneDigits],
    )

    await client.query(
      `
      INSERT INTO insurance_contact_updates (
        id, contact_id, action_type, category, company_name, manager_name, position,
        old_phone_number, new_phone_number, description, created_at
      )
      VALUES ($1, $2, 'CREATE', $3, $4, $5, $6, NULL, $7, $8, NOW())
      `,
      [randomUUID(), contactId, r.category, r.companyName, r.managerName, r.position, r.phoneDigits, desc],
    )
  }

  await touchContactLastUpdatedAt(client)
}

function parseArgs(argv) {
  const args = { paths: [], dryRun: false, sheet: '', skipReinsurerContacts: false }
  for (const a of argv) {
    if (a === '--dry-run') {
      args.dryRun = true
    } else if (a === '--skip-reinsurer-contacts') {
      args.skipReinsurerContacts = true
    } else if (a.startsWith('--sheet=')) {
      args.sheet = a.slice('--sheet='.length)
    } else if (!a.startsWith('-')) {
      args.paths.push(a)
    }
  }
  return args
}

const EDITOR = 'excel-cleaned-import'

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const defaultLocalPath = path.join('n:', '개인', 'insurance_cleaned_upload_v2.xlsx')
  const excelPath =
    args.paths[0] ||
    process.env.CLEANED_INSURANCE_EXCEL_PATH ||
    (fs.existsSync(defaultLocalPath) ? defaultLocalPath : '')

  if (!excelPath || !fs.existsSync(excelPath)) {
    console.error(
      '엑셀 경로가 필요합니다. 인자나 CLEANED_INSURANCE_EXCEL_PATH를 지정하세요.',
    )
    process.exit(1)
  }

  const workbook = XLSX.readFile(excelPath, { cellNF: false, sheetStubs: true })
  const sheetName = args.sheet || workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    console.error('시트 없음:', sheetName)
    process.exit(1)
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' })
  const COL_GUBUN = '구분'
  const COL_NAME = '보험사명'
  const COL_INCALL = '인콜'
  const COL_SYSTEM = '전산문의'
  const COL_MANAGER = '담당자'
  const COL_PHONE = '연락처'

  /** @type {Map<string, { category: string, name: string, userRows: object[] }>} */
  const groups = new Map()

  for (const row of rows) {
    let category = normalizeInsuranceCompanyCategory(row[COL_GUBUN])
    const name = String(row[COL_NAME] ?? '').trim()
    category = coerceMeritzFireToNonLifeCategory(category, name)
    if (!category || !name) {
      console.warn('[skip] 구분/보험사명 없음:', row)
      continue
    }
    const key = `${category}\0${name}`
    if (!groups.has(key)) {
      groups.set(key, { category, name, userRows: [] })
    }
    groups.get(key).userRows.push(row)
  }

  /** @type {Array<{ category: string, name: string, incall_number: string, system_phone: string, contacts: { name: string, position: string, phone: string }[] }>} */
  const companies = []

  for (const g of groups.values()) {
    const first = g.userRows[0]
    const incallRaw = String(first[COL_INCALL] ?? '').trim()
    const systemRaw = String(first[COL_SYSTEM] ?? '').trim()

    for (const row of g.userRows) {
      const ir = String(row[COL_INCALL] ?? '').trim()
      const sr = String(row[COL_SYSTEM] ?? '').trim()
      if (ir !== incallRaw || sr !== systemRaw) {
        console.warn(
          `[warn] 동일 보험사 "${g.name}" 인콜/전산 불일치(마스터는 첫 행 기준):`,
          { expectIncall: incallRaw, expectSystem: systemRaw, rowIncall: ir, rowSystem: sr },
        )
        break
      }
    }

    const contacts = []
    for (const row of g.userRows) {
      const mgrRaw = String(row[COL_MANAGER] ?? '')
        .replace(/\s+/g, ' ')
        .trim()
      const phoneRaw = String(row[COL_PHONE] ?? '').trim()
      const phone = normalizeStoredPhone(phoneRaw)
      if (!mgrRaw && !phone) {
        continue
      }
      const { name: parsedName, position } = parseManagerCell(mgrRaw)
      const cn = (parsedName || mgrRaw || '').trim() || '담당자'
      const cp = String(position ?? '').trim()
      contacts.push({ name: cn, position: cp, phone })
    }

    companies.push({
      category: g.category,
      name: g.name,
      incall_number: normalizeStoredPhone(incallRaw),
      system_phone: normalizeStoredPhone(systemRaw),
      contacts,
    })
  }

  /** 재보험사 연락처( flat 목록 ): 엑셀 한 행 = 한 연락처 */
  const reinsurerRows = []
  for (const row of rows) {
    let category = normalizeInsuranceCompanyCategory(row[COL_GUBUN])
    const companyName = String(row[COL_NAME] ?? '').trim()
    category = coerceMeritzFireToNonLifeCategory(category, companyName)
    if (!category || !companyName) {
      continue
    }
    const mgrRaw = String(row[COL_MANAGER] ?? '')
      .replace(/\s+/g, ' ')
      .trim()
    const phoneRaw = String(row[COL_PHONE] ?? '').trim()
    const { name: parsedName, position } = parseManagerCell(mgrRaw)
    const managerName = (parsedName || mgrRaw || '').trim() || '담당자'
    const phoneDigits = normalizePhoneNumberDigits(normalizeStoredPhone(phoneRaw))
    if (!phoneDigits) {
      console.warn('[skip reinsurer] 연락처 전화번호 없음:', { companyName, managerName })
      continue
    }
    reinsurerRows.push({
      category,
      companyName,
      managerName,
      position,
      phoneDigits,
    })
  }

  console.log('[cleaned-import] file:', excelPath)
  console.log('[cleaned-import] sheet:', sheetName)
  console.log('[cleaned-import] source rows:', rows.length)
  console.log('[cleaned-import] companies:', companies.length)
  console.log(
    '[cleaned-import] contacts:',
    companies.reduce((n, c) => n + c.contacts.length, 0),
  )
  console.log('[cleaned-import] reinsurer flat rows:', reinsurerRows.length)

  if (args.dryRun) {
    process.exit(0)
  }

  ensureDatabaseUrl()
  if (!String(process.env.DATABASE_URL ?? '').trim()) {
    console.error(
      'DATABASE_URL 이 없습니다. .env에 Railway Variables의 DATABASE_URL(또는 POSTGRES_URL)을 넣거나, `npm run import:cleaned-excel:railway` 로 실행하세요.',
    )
    process.exit(1)
  }

  exitIfRailwayInternalFromLocalMachine(String(process.env.DATABASE_URL))

  const { default: pool } = await import('../db.js')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const co of companies) {
      const ins = await client.query(
        `
        INSERT INTO insurance_company_master (
          category, name, customer_center, system_phone, incall_number, visit_info,
          updated_at, updated_by_username
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
        ON CONFLICT (category, name) DO UPDATE SET
          customer_center = EXCLUDED.customer_center,
          system_phone = EXCLUDED.system_phone,
          incall_number = EXCLUDED.incall_number,
          visit_info = EXCLUDED.visit_info,
          updated_at = NOW(),
          updated_by_username = EXCLUDED.updated_by_username
        RETURNING id
        `,
        [
          co.category,
          co.name,
          '',
          co.system_phone,
          co.incall_number,
          '',
          EDITOR,
        ],
      )
      const companyId = ins.rows[0].id

      await client.query(`DELETE FROM insurance_company_contacts WHERE company_id = $1`, [companyId])

      for (const ct of co.contacts) {
        await client.query(
          `
          INSERT INTO insurance_company_contacts (company_id, name, position, phone)
          VALUES ($1, $2, $3, $4)
          `,
          [companyId, ct.name || '담당자', ct.position, ct.phone],
        )
      }
    }

    if (!args.skipReinsurerContacts) {
      await replaceReinsurerContactsFromExcel(client, reinsurerRows)
      console.log('[cleaned-import] insurance_contacts 재보험사 목록 교체:', reinsurerRows.length, '건')
    } else {
      console.log('[cleaned-import] --skip-reinsurer-contacts: insurance_contacts 생략')
    }

    await client.query('COMMIT')
    console.log('[cleaned-import] DB 반영 완료')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[cleaned-import] DB 오류:', e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
