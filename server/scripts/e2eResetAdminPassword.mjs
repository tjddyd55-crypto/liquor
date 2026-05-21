/**
 * develop E2E용 admin password_hash 임시 갱신 (값 로그·커밋 금지).
 * npm run e2e:government:reset-admin-password
 * 권장: railway run -e develop -s app npm run e2e:government:reset-admin-password
 * 후속: docs/government-support-admin-password-ops.md §5
 */
import bcrypt from 'bcryptjs'
import pool from '../db.js'
import { assertDevelopDbTarget, requireE2ePasswordFromEnv } from './lib/e2eGovernmentHttpEnv.mjs'

assertDevelopDbTarget()
const password = requireE2ePasswordFromEnv()
const loginId = String(
  process.env.E2E_GOVERNMENT_ADMIN_LOGIN_ID ?? process.env.GOVERNMENT_ADMIN_LOGIN_ID ?? 'admin',
).trim()
const hash = await bcrypt.hash(password, 10)
await pool.query(`UPDATE users SET password_hash = $1 WHERE username = $2`, [hash, loginId])
console.log('admin_password_reset_ok', { loginId })
await pool.end()
