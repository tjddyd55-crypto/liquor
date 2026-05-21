/**
 * 운영 DB 보험사 마스터/연락처 즉시 정리 (initDb와 별도)
 *
 * 요구 절차: [1] 스냅샷 → 트랜잭션 정리 → [6] 검증
 *
 *   node server/scripts/runOperDbCompanyDirectoryFix.mjs
 *   node server/scripts/runOperDbCompanyDirectoryFix.mjs --dry-run   # SELECT만
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  runCompanyDirectorySanitize,
  touchContactLastUpdatedAt,
} from '../lib/companyDirectorySanitize.js'

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

function ensureDatabaseUrl() {
  const isUsable = (v) => {
    const s = String(v ?? '').trim()
    if (!s || s.includes('user:password@host')) {
      return false
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

function exitIfRailwayInternalFromLocalMachine(url) {
  if (!url || !/\.railway\.internal\b/i.test(String(url))) {
    return
  }
  if (process.env.RAILWAY_ENVIRONMENT) {
    return
  }
  console.error('[oper-db] 로컬에서는 Public Network DATABASE URL이 필요합니다.')
  process.exit(1)
}

const NORM_M = `regexp_replace(trim(COALESCE(m.name, '')), '\\s+', '', 'g')`

const LIFE_CATEGORY_SQL = `(m.category = 'LIFE' OR m.category = '생명')`

const MASTER_SCOPE_WHERE = `
(
  (${LIFE_CATEGORY_SQL} AND (
    lower(regexp_replace(trim(m.name), '\\s+', '', 'g')) = 'db생명'
    OR ${NORM_M} = '메리츠화재'
  ))
  OR (m.category = 'NON_LIFE' AND ${NORM_M} IN ('메리츠', '메리츠화재', '심플손해보험'))
)
`

async function fetchMastersWithContacts(client) {
  const m = await client.query(`
    SELECT m.id, m.category, m.name, m.created_at, m.updated_at,
      length(m.name) AS name_char_len,
      encode(convert_to(m.name, 'UTF8'), 'hex') AS name_utf8_hex
    FROM insurance_company_master m
    WHERE ${MASTER_SCOPE_WHERE}
    ORDER BY m.category, m.id
  `)
  const c = await client.query(`
    SELECT m.id AS master_id, m.category, m.name AS company_name,
      c.id AS contact_id, c.name AS contact_name, c.position, c.phone
    FROM insurance_company_master m
    LEFT JOIN insurance_company_contacts c ON c.company_id = m.id
    WHERE ${MASTER_SCOPE_WHERE}
    ORDER BY m.category, m.id, c.id NULLS LAST
  `)
  return { masters: m.rows, contacts: c.rows }
}

async function fetchVerification(client) {
  const pairs = [
    [
      'LIFE',
      'db생명',
      `${LIFE_CATEGORY_SQL} AND lower(regexp_replace(trim(m.name), '\\s+', '', 'g')) = 'db생명'`,
    ],
    ['LIFE', '메리츠화재', `${LIFE_CATEGORY_SQL} AND ${NORM_M} = '메리츠화재'`],
    ['NON_LIFE', '메리츠', `m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠'`],
    ['NON_LIFE', '메리츠화재', `m.category = 'NON_LIFE' AND ${NORM_M} = '메리츠화재'`],
    ['NON_LIFE', '심플손해보험', `m.category = 'NON_LIFE' AND ${NORM_M} = '심플손해보험'`],
  ]
  const out = []
  for (const [category, label, cond] of pairs) {
    const r = await client.query(
      `
      SELECT m.id, m.category, m.name, m.created_at, m.updated_at
      FROM insurance_company_master m
      WHERE ${cond}
      ORDER BY m.id
    `,
    )
    out.push({ category, normalizeTarget: label, rows: r.rows, count: r.rowCount })
  }
  return out
}

function printSection(title, data) {
  console.log('\n========', title, '========')
  console.log(JSON.stringify(data, null, 2))
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')
ensureDatabaseUrl()

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  ensureDatabaseUrl()
  const dbUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!dbUrl) {
    console.error('[oper-db] DATABASE_URL 이 없습니다.')
    process.exit(1)
  }
  exitIfRailwayInternalFromLocalMachine(dbUrl)

  const { default: pool } = await import('../db.js')
  const client = await pool.connect()
  const log = (msg, ...args) => console.log('[oper-db]', msg, ...args)

  try {
    const before = await fetchMastersWithContacts(client)
    const beforeVer = await fetchVerification(client)
    printSection('[1] 작업 전 — 마스터·연락처(대상 범위)', {
      masters: before.masters,
      contacts: before.contacts,
    })
    printSection('[1b] 작업 전 — 검증용 조각', beforeVer)

    if (dryRun) {
      log('dry-run: DB 변경 없음')
      return
    }

    await client.query('BEGIN')
    try {
      await runCompanyDirectorySanitize(client, log)
      await touchContactLastUpdatedAt(client)
      await client.query('COMMIT')
      log('COMMIT 완료')
    } catch (e) {
      await client.query('ROLLBACK')
      const err = /** @type {{ cleanupStep?: string } & Error} */ (e instanceof Error ? e : new Error(String(e)))
      console.error('[oper-db] ROLLBACK. 실패 단계:', err.cleanupStep ?? '(미표시)')
      console.error('[oper-db] 오류:', err)
      process.exitCode = 1
      return
    }

    const after = await fetchMastersWithContacts(client)
    const afterVer = await fetchVerification(client)
    printSection('[6] 작업 후 — 마스터·연락처(동일 범위)', {
      masters: after.masters,
      contacts: after.contacts,
    })
    printSection('[6b] 작업 후 — 검증용 조각', afterVer)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
