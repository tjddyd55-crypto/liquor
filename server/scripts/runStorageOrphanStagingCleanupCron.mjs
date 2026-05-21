/**
 * uploading / failed 파일 행 및 R2 정리 — GA별 배치(cron)용.
 *
 * node server/scripts/runStorageOrphanStagingCleanupCron.mjs
 *   [--uploading-older-minutes=20] [--failed-older-hours=168] [--batch=80]
 *
 * 환경: 프로젝트 루트 .env / .env.local 의 DATABASE_URL (또는 Railway 공개 URL)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runStorageUploadOrphanCleanup } from '../lib/storageOrphanCleanup.js'

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

function parseArgInt(name, defaultValue) {
  const prefix = `${name}=`
  const raw = process.argv.find((a) => a.startsWith(prefix))
  if (!raw) {
    return defaultValue
  }
  const n = Number(raw.slice(prefix.length))
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : defaultValue
}

loadEnvFileIfPresent(projectRoot, '.env')
loadEnvFileIfPresent(projectRoot, '.env.local')
ensureDatabaseUrl()

async function main() {
  const dbUrl = String(process.env.DATABASE_URL ?? '').trim()
  if (!dbUrl) {
    console.error('[storage-orphan-cron] DATABASE_URL 이 없습니다.')
    process.exit(1)
  }

  const uploadingOlderThanMinutes = parseArgInt('--uploading-older-minutes', 20)
  const failedOlderThanHours = parseArgInt('--failed-older-hours', 168)
  const batch = parseArgInt('--batch', 80)

  const { default: pool } = await import('../db.js')
  try {
    const gaRes = await pool.query(`SELECT id FROM ga_companies ORDER BY id`)
    for (const row of gaRes.rows) {
      const gaId = Number(row.id)
      if (!Number.isInteger(gaId) || gaId < 1) {
        continue
      }
      const out = await runStorageUploadOrphanCleanup(pool, {
        gaId,
        uploadingOlderThanMinutes,
        failedOlderThanHours,
        batchLimit: batch,
      })
      console.log('[storage-orphan-cron] GA', gaId, out)
    }
  } finally {
    await pool.end()
  }
}

main().catch((e) => {
  console.error('[storage-orphan-cron] 실패', e)
  process.exit(1)
})
