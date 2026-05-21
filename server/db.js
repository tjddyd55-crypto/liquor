import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const serverDir = path.dirname(fileURLToPath(import.meta.url))

// server/.env → server/.env.local (로컬만, gitignore) 순으로 로드
dotenv.config({ path: path.join(serverDir, '.env') })
dotenv.config({ path: path.join(serverDir, '.env.local'), override: true })

const { Pool } = pg

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL 환경변수가 필요합니다. server/.env 또는 server/.env.local 을 확인하세요.')
}

function hostFromConnectionString(url) {
  try {
    return new URL(url).hostname
  } catch {
    return ''
  }
}

/** Railway public proxy 등은 로컬에서도 SSL 이 필요한 경우가 많다. */
function connectionNeedsSsl(url) {
  if (process.env.NODE_ENV === 'production' || Boolean(process.env.RAILWAY_ENVIRONMENT)) {
    return true
  }
  const host = hostFromConnectionString(url)
  return /(?:^|\.)railway\.app$|\.rlwy\.net$/i.test(host)
}

const useSsl = connectionNeedsSsl(connectionString)

const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 20_000),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 30_000),
})

pool.on('error', (err) => {
  console.error('[db] idle client error', err)
})

if (process.env.INSURANCE_DB_LOG_CONNECTION === 'true') {
  const host = hostFromConnectionString(connectionString)
  console.log(`[db] pool ready host=${host} ssl=${useSsl}`)
}

export default pool
