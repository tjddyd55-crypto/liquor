/**
 * CRM-liqour develop app — Railway 변수 일괄 설정 (secret 출력 없음).
 * DATABASE_URL: Postgres reference variable
 * R2/JWT: CRM-government develop 과 동일 dev 버킷·신규 JWT
 */
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'

const PROJECT = '0315198d-9564-42de-bfb3-6234dfccf530'
const ENV = 'develop'
const SERVICE = 'app'
const REF_PROJECT = '22948583-faf7-42b4-bd28-124f6eba0b51'

function runRailway(args, stdin) {
  const cmd = ['railway', ...args, '-p', PROJECT, '-e', ENV, '-s', SERVICE].join(' ')
  execSync(cmd, {
    stdio: stdin ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    input: stdin,
    encoding: 'utf8',
  })
}

function parseKeyValueLines(text) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const idx = line.indexOf('=')
    if (idx <= 0) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1)
    if (key && !key.startsWith('RAILWAY_')) out[key] = val
  }
  return out
}

function fetchRefVars() {
  const raw = execSync(
    ['railway', 'variable', 'list', '-s', 'app', '-e', 'develop', '-p', REF_PROJECT, '-k'].join(' '),
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  return parseKeyValueLines(raw)
}

const ref = fetchRefVars()
const jwtSecret = crypto.randomBytes(48).toString('base64url')

/** @type {Record<string, string>} */
const toSet = {
  DATABASE_URL: '${{Postgres.DATABASE_URL}}',
  NODE_ENV: 'production',
  VITE_API_BASE_PATH: '/backend',
  APP_PRODUCT: 'liquor',
  CRM_R2_OBJECT_ROOT: 'crm-platform/development/liquor/tenants',
  JWT_SECRET: jwtSecret,
}

const r2Keys = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_BUCKET',
  'R2_ENDPOINT',
  'R2_PUBLIC_CDN_BASE',
  'R2_PUBLIC_URL',
]
for (const k of r2Keys) {
  if (ref[k]) toSet[k] = ref[k]
}

for (const [key, value] of Object.entries(toSet)) {
  runRailway(['variable', 'set', `${key}=${value}`])
  process.stdout.write(`set ${key}=<redacted>\n`)
}

process.stdout.write('done\n')
