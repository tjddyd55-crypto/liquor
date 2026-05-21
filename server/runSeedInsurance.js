/**
 * 수동 시드: DB 마이그레이션 후 insurance_company_master 가 비어 있을 때만 SEED_DATA 삽입.
 * 사용: node server/runSeedInsurance.js
 */
import pool from './db.js'
import { initDb } from './initDb.js'
import { seedAll } from './seedInsuranceFullData.js'

async function main() {
  await initDb()
  const countResult = await pool.query(`SELECT COUNT(*) AS c FROM insurance_company_master`)
  if ((countResult.rows[0]?.c ?? 0) > 0) {
    console.log('[runSeedInsurance] insurance_company_master 에 이미 데이터가 있습니다. 삽입 생략.')
    await pool.end()
    process.exit(0)
  }
  await seedAll(pool)
  console.log('[runSeedInsurance] 완료')
  await pool.end()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  pool.end().finally(() => process.exit(1))
})
