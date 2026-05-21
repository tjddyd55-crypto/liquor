/**
 * develop E2E용 program user 시드 (e2e_ua_dev, e2e_ub_dev).
 * npm run e2e:government:seed-program-users
 * 권장: railway run -e develop -s app npm run e2e:government:seed-program-users
 */
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import pool from '../db.js'
import { assertDevelopDbTarget, requireE2ePasswordFromEnv } from './lib/e2eGovernmentHttpEnv.mjs'

assertDevelopDbTarget()
const password = requireE2ePasswordFromEnv()
const hash = await bcrypt.hash(password, 10)

const ga = await pool.query(`SELECT id FROM ga_companies WHERE LOWER(code)='government_crm' LIMIT 1`)
const gaId = ga.rows[0]?.id
const ind = await pool.query(`SELECT id FROM industries WHERE LOWER(code)='government' LIMIT 1`)
const industryId = ind.rows[0]?.id
const tenants = await pool.query(`SELECT id FROM tenants ORDER BY id DESC LIMIT 2`)
const tenantB = tenants.rows[0]?.id
const tenantA = tenants.rows[1]?.id ?? tenantB

const userA = String(process.env.E2E_GOVERNMENT_USER_A ?? 'e2e_ua_dev').trim()
const userB = String(process.env.E2E_GOVERNMENT_USER_B ?? 'e2e_ub_dev').trim()

async function ensureUser(username, tenantId) {
  const ex = await pool.query(`SELECT id FROM users WHERE username = $1`, [username])
  if (ex.rowCount) {
    console.log('exists', username)
    return
  }
  const id = randomUUID()
  await pool.query(
    `INSERT INTO users (id, username, password_hash, role, ga_id, display_name, status, invited_by_user_id)
     VALUES ($1, $2, $3, 'USER', $4, $5, 'active', $1)`,
    [id, username, hash, gaId, username],
  )
  await pool.query(
    `
    INSERT INTO user_memberships (
      user_id, role, scope_type, scope_id, tenant_id, industry_id, status, membership_type, customer_access
    )
    SELECT $1, 'government_user', 'tenant', $2::text, $3, $4, 'active', 'agent', 'own'
    WHERE NOT EXISTS (
      SELECT 1 FROM user_memberships
      WHERE user_id = $1 AND role = 'government_user' AND tenant_id = $3
    )
    `,
    [id, String(tenantId), tenantId, industryId],
  )
  console.log('created', username, tenantId)
}

await ensureUser(userA, tenantA)
await ensureUser(userB, tenantB)
console.log('seed_ok', { tenantA, tenantB, userA, userB })
await pool.end()
