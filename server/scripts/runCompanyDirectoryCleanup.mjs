/**
 * 1회성 데이터 정리 (메리츠 / 심플손해보험 / DB생명 중복)
 *
 * 로직 본문: server/lib/companyDirectorySanitize.js (initDb 기동 시에도 동일 적용)
 *
 * node server/scripts/runCompanyDirectoryCleanup.mjs [--dry-run]
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
  console.error('[cleanup] 로컬에서는 Public Network DATABASE URL이 필요합니다.')
  process.exit(1)
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')
ensureDatabaseUrl()

const NORM_M = `regexp_replace(trim(COALESCE(m.name, '')), '\\s+', '', 'g')`
const NORM_IC = `regexp_replace(trim(COALESCE(company_name, '')), '\\s+', '', 'g')`

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  ensureDatabaseUrl()
  const dbUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!dbUrl) {
    console.error('[cleanup] DATABASE_URL 이 없습니다.')
    process.exit(1)
  }
  exitIfRailwayInternalFromLocalMachine(dbUrl)

  const { default: pool } = await import('../db.js')
  const client = await pool.connect()

  const log = (msg, ...args) => console.log('[cleanup]', msg, ...args)

  try {
    if (dryRun) {
      const peek = async (label, sql, params = []) => {
        const r = await client.query(sql, params)
        log(`${label}:`, r.rowCount, '행')
      }
      await peek(
        '대상 LIFE·메리츠화재(공백무시) 마스터',
        `SELECT m.id FROM insurance_company_master m
         WHERE m.category='LIFE' AND ${NORM_M} = '메리츠화재'`,
      )
      await peek(
        '대상 NON_LIFE·메리츠 / 메리츠화재',
        `SELECT m.id, m.name FROM insurance_company_master m
         WHERE m.category='NON_LIFE' AND ${NORM_M} IN ('메리츠','메리츠화재')`,
      )
      await peek(
        '대상 심플손해보험 마스터',
        `SELECT m.id FROM insurance_company_master m
         WHERE m.category='NON_LIFE' AND ${NORM_M} = '심플손해보험'`,
      )
      await peek(
        'LIFE·DB생명 마스터(공백 무시)',
        `SELECT m.id, m.name FROM insurance_company_master m
         WHERE m.category='LIFE'
           AND lower(regexp_replace(trim(m.name), '\\s+', '', 'g')) = 'db생명'`,
      )
      log('dry-run — 위만 조회, DB 변경 없음 (적용: 같은 명령에서 --dry-run 제거)')
      return
    }

    await client.query('BEGIN')
    await runCompanyDirectorySanitize(client, log)
    await touchContactLastUpdatedAt(client)
    await client.query('COMMIT')
    log('완료')
  } catch (e) {
    await client.query('ROLLBACK')
    console.error('[cleanup] 오류:', e)
    process.exitCode = 1
  } finally {
    client.release()
    await pool.end()
  }
}

main()
