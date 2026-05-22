/**
 * CRM-liqour develop E2E용 Railway 변수 (값은 런타임 생성, 출력 redacted).
 */
import { execSync } from 'node:child_process'
import crypto from 'node:crypto'

const PROJECT = '0315198d-9564-42de-bfb3-6234dfccf530'
const ENV = 'develop'
const SERVICE = 'app'

/** @type {Record<string, string>} */
const vars = {
  INSURANCE_ENABLE_ADMIN_BOOTSTRAP: 'true',
  INSURANCE_ADMIN_BOOTSTRAP_USERNAME: 'admin',
  INSURANCE_ADMIN_BOOTSTRAP_PASSWORD: crypto.randomBytes(24).toString('base64url'),
  INSURANCE_SMS_DEBUG_RESPONSE_CODE: 'true',
  CONTRACT_OTP_PEPPER: crypto.randomBytes(32).toString('base64url'),
  CONTRACT_TARGET_PHONE_ENCRYPTION_KEY: crypto.randomBytes(32).toString('hex'),
  ALIGO_TEST_MODE: 'Y',
}

for (const [key, value] of Object.entries(vars)) {
  const cmd = ['railway', 'variable', 'set', `${key}=${value}`, '-p', PROJECT, '-e', ENV, '-s', SERVICE, '--skip-deploys'].join(' ')
  execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
  process.stdout.write(`set ${key}=<redacted>\n`)
}

execSync(['railway', 'redeploy', '-p', PROJECT, '-e', ENV, '-s', SERVICE, '-y'].join(' '), { stdio: 'inherit' })

// E2E 스크립트용 — 로컬 셸 env 파일 (gitignore 대상)
import fs from 'node:fs'
fs.writeFileSync('.e2e-liquor-local.env', `E2E_LIQUOR_ADMIN_PASSWORD=${vars.INSURANCE_ADMIN_BOOTSTRAP_PASSWORD}\n`, 'utf8')
process.stdout.write('wrote .e2e-liquor-local.env (local only, do not commit)\n')
