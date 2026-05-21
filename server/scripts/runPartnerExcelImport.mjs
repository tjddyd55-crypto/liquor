/**
 * 제휴사 엑셀(셀 배경색) → insuranceCompanyMap 반영 + DB 동기화
 *
 * 사용:
 *   node server/scripts/runPartnerExcelImport.mjs "N:\\경로\\파일.xlsx" [--write-ts] [--apply-db] [--dry-run]
 *
 * 환경변수: PARTNER_EXCEL_PATH (파일 경로)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import {
  buildInsuranceCompanyMap,
  cleanPhone,
  parsePartnerWorkbookSheet,
} from '../lib/partnerExcelParse.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const defaultConstantsPath = path.join(
  projectRoot,
  'src',
  'features',
  'company-registry',
  'domain',
  'insuranceConstants.ts',
)

function parseArgs(argv) {
  const args = { paths: [], writeTs: false, applyDb: false, dryRun: false, sheet: '' }
  for (const a of argv) {
    if (a === '--write-ts') {
      args.writeTs = true
    } else if (a === '--apply-db') {
      args.applyDb = true
    } else if (a === '--dry-run') {
      args.dryRun = true
    } else if (a.startsWith('--sheet=')) {
      args.sheet = a.slice('--sheet='.length)
    } else if (!a.startsWith('-')) {
      args.paths.push(a)
    }
  }
  return args
}

function tsString(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
}

function formatCompanyMapTs(map) {
  const lines = [`export const insuranceCompanyMap: Record<InsuranceCategory, InsuranceCompanyOption[]> = {`]
  for (const cat of ['LIFE', 'NON_LIFE', 'GENERAL']) {
    lines.push(`  ${cat}: [`)
    for (const o of map[cat]) {
      lines.push(`    { name: '${tsString(o.name)}', tel: '${tsString(o.tel)}' },`)
    }
    lines.push(`  ],`)
  }
  lines.push(`}`)
  lines.push(``)
  lines.push(`/** 드롭다운 표시용 보험사 이름 목록 (insuranceCompanyMap과 동기화) */`)
  lines.push(`export const INSURANCE_COMPANIES_BY_TYPE: Record<InsuranceCategory, string[]> = {`)
  lines.push(`  LIFE: insuranceCompanyMap.LIFE.map((c) => c.name),`)
  lines.push(`  NON_LIFE: insuranceCompanyMap.NON_LIFE.map((c) => c.name),`)
  lines.push(`  GENERAL: insuranceCompanyMap.GENERAL.map((c) => c.name),`)
  lines.push(`}`)
  return lines.join('\n')
}

function patchInsuranceConstantsFile(filePath, mapBlockTs) {
  const raw = fs.readFileSync(filePath, 'utf8')
  const startMarker = 'export const insuranceCompanyMap:'
  const endMarker = 'export function isInsuranceCategory'
  const i0 = raw.indexOf(startMarker)
  const i1 = raw.indexOf(endMarker)
  if (i0 === -1 || i1 === -1 || i1 <= i0) {
    throw new Error(`patch 실패: ${startMarker} / ${endMarker} 를 찾을 수 없습니다.`)
  }
  const before = raw.slice(0, i0)
  const after = raw.slice(i1)
  const next = `${before}${mapBlockTs}\n\n${after}`
  fs.writeFileSync(filePath, next, 'utf8')
}

async function upsertCompaniesAndContacts(client, companies) {
  for (const co of companies) {
    if (!co.name?.trim() || !['LIFE', 'NON_LIFE', 'GENERAL'].includes(co.category)) {
      continue
    }
    const ins = await client.query(
      `
      INSERT INTO insurance_company_master (
        category, name, customer_center, system_phone, incall_number, visit_info,
        updated_at, updated_by_username
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      ON CONFLICT (category, name) DO NOTHING
      RETURNING id
      `,
      [
        co.category,
        co.name.trim(),
        cleanPhone(co.customer_center),
        cleanPhone(co.system_phone),
        cleanPhone(co.incall_number),
        String(co.visit_info ?? '').trim(),
        'excel-import',
      ],
    )
    let companyId = ins.rows[0]?.id
    if (companyId == null) {
      const sel = await client.query(
        `SELECT id FROM insurance_company_master WHERE category = $1 AND name = $2`,
        [co.category, co.name.trim()],
      )
      companyId = sel.rows[0]?.id
    }
    if (companyId == null) {
      throw new Error(`company id 조회 실패: ${co.category} / ${co.name}`)
    }

    await client.query(`DELETE FROM insurance_company_contacts WHERE company_id = $1`, [companyId])

    for (const ct of co.contacts ?? []) {
      const name = String(ct.name ?? '').trim()
      const position = String(ct.position ?? '').trim()
      const phone = cleanPhone(ct.phone ?? '')
      if (!name && !phone) {
        continue
      }
      await client.query(
        `INSERT INTO insurance_company_contacts (company_id, name, position, phone) VALUES ($1, $2, $3, $4)`,
        [companyId, name || '담당자', position, phone],
      )
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const excelPath =
    args.paths[0] || process.env.PARTNER_EXCEL_PATH || ''
  if (!excelPath || !fs.existsSync(excelPath)) {
    console.error('엑셀 파일 경로가 필요합니다. 인자 또는 PARTNER_EXCEL_PATH 를 지정하세요.')
    process.exit(1)
  }

  const workbook = XLSX.readFile(excelPath, { cellStyles: true, cellNF: false, sheetStubs: true })
  const sheetName =
    args.sheet ||
    workbook.SheetNames.find((n) => n !== 'Sheet1') ||
    workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) {
    console.error('시트 없음:', sheetName)
    process.exit(1)
  }

  console.log('[import] file:', excelPath)
  console.log('[import] sheet:', sheetName)

  const { companies } = parsePartnerWorkbookSheet(sheet, XLSX)
  const map = buildInsuranceCompanyMap(companies)
  const mapBlock = formatCompanyMapTs(map)

  console.log('[import] companies:', companies.length)
  console.log('[import] LIFE / NON_LIFE / GENERAL:', map.LIFE.length, map.NON_LIFE.length, map.GENERAL.length)
  console.log('[import] contact rows:', companies.reduce((n, c) => n + (c.contacts?.length ?? 0), 0))

  if (args.dryRun) {
    console.log('[import] dry-run — 파일·DB 반영 생략')
    process.exit(0)
  }

  if (args.writeTs) {
    patchInsuranceConstantsFile(defaultConstantsPath, mapBlock)
    console.log('[import] wrote:', defaultConstantsPath)
  }

  if (args.applyDb) {
    const { default: pool } = await import('../db.js')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await upsertCompaniesAndContacts(client, companies)
      await client.query('COMMIT')
      console.log('[import] DB 반영 완료')
    } catch (e) {
      await client.query('ROLLBACK')
      console.error('[import] DB 오류:', e)
      process.exit(1)
    } finally {
      client.release()
      await pool.end()
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
