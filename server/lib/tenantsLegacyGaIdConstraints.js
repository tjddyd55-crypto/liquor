/**
 * tenants.legacy_ga_id — 보험 등 비-government 업종만 GA당 1 tenant, government는 다중 tenant 허용.
 * @module tenantsLegacyGaIdConstraints
 */
import { GOVERNMENT_INDUSTRY_CODE } from './governmentSupport/constants.js'

/**
 * @param {import('pg').Pool | import('pg').PoolClient | { query: Function }} executor
 */
export async function resolveGovernmentIndustryIdForMigration(executor) {
  const r = await executor.query(
    `
    SELECT id::text AS id
    FROM industries
    WHERE LOWER(TRIM(code)) = $1
    LIMIT 1
    `,
    [GOVERNMENT_INDUSTRY_CODE],
  )
  const id = r.rows[0]?.id
  if (id == null || String(id).trim() === '') {
    return null
  }
  return String(id)
}

/**
 * 전역 UNIQUE(legacy_ga_id) 제거 후, government 업종을 제외한 partial unique index 적용.
 * @param {import('pg').Pool | import('pg').PoolClient | { query: Function }} executor
 */
export async function ensureTenantsLegacyGaIdConstraints(executor) {
  await executor.query(`
    ALTER TABLE tenants
    DROP CONSTRAINT IF EXISTS tenants_legacy_ga_id_key
  `)

  await executor.query(`
    DROP INDEX IF EXISTS tenants_legacy_ga_id_key
  `)

  const governmentIndustryId = await resolveGovernmentIndustryIdForMigration(executor)

  await executor.query(`
    DROP INDEX IF EXISTS tenants_legacy_ga_id_non_government_uk
  `)

  if (governmentIndustryId != null) {
    const govId = String(governmentIndustryId).trim()
    if (!/^\d+$/.test(govId)) {
      throw new Error('government industry id must be numeric for legacy_ga_id migration')
    }
    await executor.query(`
      CREATE UNIQUE INDEX tenants_legacy_ga_id_non_government_uk
      ON tenants (legacy_ga_id)
      WHERE legacy_ga_id IS NOT NULL
        AND industry_id IS DISTINCT FROM ${govId}::bigint
    `)
    return
  }

  await executor.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_legacy_ga_id_non_government_uk
    ON tenants (legacy_ga_id)
    WHERE legacy_ga_id IS NOT NULL
  `)
}
