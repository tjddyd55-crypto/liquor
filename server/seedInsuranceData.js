import pool from './db.js'
import { systemQuery } from './utils/dbSafeQuery.js'
import { seedAll } from './seedInsuranceFullData.js'

/**
 * insurance_company_master 가 비어 있을 때만 seedInsuranceFullData.js 의 SEED_DATA 를 삽입합니다.
 * 서버 기동 시 idempotent 로 1회에 해당합니다.
 */
export async function seedInsuranceCompanyDirectory() {
  const countResult = await systemQuery(pool, `SELECT COUNT(*) AS c FROM insurance_company_master`)
  if ((countResult.rows[0]?.c ?? 0) > 0) {
    return
  }

  await seedAll(pool)
}
