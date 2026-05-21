/**
 * 30일(기본)보다 오래된 sms_verification_logs 삭제.
 * Railway cron 등: 매일 1회 `node server/scripts/runPurgeSmsVerificationLogs.mjs`
 *
 * 보관 일수: INSURANCE_SMS_LOG_RETENTION_DAYS (기본 30)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deleteSmsVerificationLogsOlderThan,
  resolveSmsLogRetentionDays,
} from '../services/purgeSmsVerificationLogs.js'

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
  console.error('[purge-sms-logs] 로컬에서는 Public Network DATABASE URL이 필요합니다.')
  process.exit(1)
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')
ensureDatabaseUrl()

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  ensureDatabaseUrl()
  const dbUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!dbUrl) {
    console.error('[purge-sms-logs] DATABASE_URL 이 없습니다.')
    process.exit(1)
  }
  exitIfRailwayInternalFromLocalMachine(dbUrl)

  const days = resolveSmsLogRetentionDays()
  const { default: pool } = await import('../db.js')

  try {
    if (dryRun) {
      const r = await pool.query(
        `
        SELECT COUNT(*) AS c
        FROM sms_verification_logs
        WHERE created_at < NOW() - (CAST($1 AS integer) * INTERVAL '1 day')
        `,
        [days],
      )
      console.log(
        '[purge-sms-logs] dry-run: 삭제 대상 행(추정)',
        String(r.rows[0]?.c ?? 0),
        `/ retention ${days}일`,
      )
      return
    }

    const deleted = await deleteSmsVerificationLogsOlderThan(pool, days)
    console.log('[purge-sms-logs] 삭제 완료:', deleted, '행', `/ retention ${days}일`)
  } catch (e) {
    console.error('[purge-sms-logs] 오류:', e)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()
