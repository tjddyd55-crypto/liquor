import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureTenantsLegacyGaIdConstraints,
  resolveGovernmentIndustryIdForMigration,
} from './tenantsLegacyGaIdConstraints.js'

describe('tenantsLegacyGaIdConstraints', () => {
  it('resolveGovernmentIndustryIdForMigration returns id when row exists', async () => {
    const pool = {
      query: async () => ({ rows: [{ id: '42' }] }),
    }
    const id = await resolveGovernmentIndustryIdForMigration(pool)
    assert.equal(id, '42')
  })

  it('ensureTenantsLegacyGaIdConstraints drops global unique and creates partial index', async () => {
    const sql = []
    const pool = {
      query: async (text, params) => {
        sql.push({ text: String(text).replace(/\s+/g, ' ').trim(), params })
        if (String(text).includes('FROM industries')) {
          return { rows: [{ id: '99' }] }
        }
        return { rows: [] }
      },
    }
    await ensureTenantsLegacyGaIdConstraints(pool)
    assert.ok(sql.some((q) => q.text.includes('DROP CONSTRAINT IF EXISTS tenants_legacy_ga_id_key')))
    assert.ok(sql.some((q) => q.text.includes('DROP INDEX IF EXISTS tenants_legacy_ga_id_non_government_uk')))
    const createIdx = sql.find((q) => q.text.includes('CREATE UNIQUE INDEX tenants_legacy_ga_id_non_government_uk'))
    assert.ok(createIdx)
    assert.ok(createIdx.text.includes('industry_id IS DISTINCT FROM 99::bigint'))
  })
})
