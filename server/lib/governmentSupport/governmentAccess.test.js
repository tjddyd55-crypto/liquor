import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { resolveTenantIdForProfileCreate } from './governmentAccess.js'

describe('resolveTenantIdForProfileCreate', () => {
  it('program user: 소속 tenant 사용', async () => {
    const pool = {
      query: async (sql) => {
        if (String(sql).includes('FROM tenants t') && String(sql).includes('industries')) {
          return { rows: [], rowCount: 0 }
        }
        return { rows: [], rowCount: 0 }
      },
    }
    const ctx = {
      userId: 'u3',
      governmentIndustryAdminIndustryIds: [],
      governmentAgencyAdminTenantIds: [],
      governmentStaffTenantIds: [],
      governmentProgramUserTenantIds: ['15'],
    }
    const r = await resolveTenantIdForProfileCreate(pool, ctx, null)
    assert.equal(r.ok, true)
    assert.equal(r.tenantId, '15')
  })

  it('staff 멤버: 프로필 생성 불가', async () => {
    const pool = { query: async () => ({ rows: [], rowCount: 0 }) }
    const ctx = {
      userId: 'u2',
      governmentIndustryAdminIndustryIds: [],
      governmentAgencyAdminTenantIds: [],
      governmentStaffTenantIds: ['12'],
    }
    const r = await resolveTenantIdForProfileCreate(pool, ctx, null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 403)
  })

  it('industry admin: 프로필 생성 불가', async () => {
    const pool = { query: async () => ({ rows: [], rowCount: 0 }) }
    const ctx = {
      userId: 'u1',
      governmentIndustryAdminIndustryIds: ['3'],
      governmentAgencyAdminTenantIds: [],
      governmentStaffTenantIds: [],
    }
    const r = await resolveTenantIdForProfileCreate(pool, ctx, null)
    assert.equal(r.ok, false)
    assert.equal(r.status, 403)
  })
})
