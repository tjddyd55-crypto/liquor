/**
 * Railway develop: LIQUOR_SIGNATURE_* 키가 없으면 CONTRACT_* 값을 복사 (값 출력 없음).
 */
import { execSync } from 'node:child_process'

function parseKv(text) {
  /** @type {Record<string, string>} */
  const out = {}
  for (const line of String(text).split(/\r?\n/)) {
    const i = line.indexOf('=')
    if (i <= 0) continue
    out[line.slice(0, i).trim()] = line.slice(i + 1)
  }
  return out
}

const raw = execSync('railway variable list -k', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
const vars = parseKv(raw)

/** @type {Record<string, string>} */
const toSet = {}
if (!vars.LIQUOR_SIGNATURE_OTP_PEPPER && vars.CONTRACT_OTP_PEPPER) {
  toSet.LIQUOR_SIGNATURE_OTP_PEPPER = vars.CONTRACT_OTP_PEPPER
}
if (!vars.LIQUOR_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY && vars.CONTRACT_TARGET_PHONE_ENCRYPTION_KEY) {
  toSet.LIQUOR_SIGNATURE_TARGET_PHONE_ENCRYPTION_KEY = vars.CONTRACT_TARGET_PHONE_ENCRYPTION_KEY
}

if (Object.keys(toSet).length === 0) {
  process.stdout.write('no-op: LIQUOR_SIGNATURE_* already set or CONTRACT_* missing\n')
  process.exit(0)
}

for (const [key, value] of Object.entries(toSet)) {
  execSync(`railway variable set ${key}=${value} --skip-deploys`, { stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(`set ${key}=<copied from CONTRACT_*, redacted>\n`)
}
