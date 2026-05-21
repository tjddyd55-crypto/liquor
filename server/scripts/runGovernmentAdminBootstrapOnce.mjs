/**
 * Railway develop 등 원격 ENV로 정부지원 관리자 bootstrap 1회 실행.
 * 사용: railway run -e develop -s app node server/scripts/runGovernmentAdminBootstrapOnce.mjs
 */
import pool from '../db.js'
import { ensureGovernmentAdminBootstrap } from '../lib/governmentSupport/ensureGovernmentAdminBootstrap.js'

await ensureGovernmentAdminBootstrap(pool)
await pool.end()
console.log('[runGovernmentAdminBootstrapOnce] done')
