import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GOV_PROFILE_MEMO_MAX_LENGTH,
  mapGovSupportProfileMemoRow,
  normalizeGovProfileMemoContent,
} from './governmentProfileMemos.js'
import { canAccessGovernmentProfile } from './governmentAccess.js'

describe('normalizeGovProfileMemoContent', () => {
  it('빈 내용 거부', () => {
    const r = normalizeGovProfileMemoContent('   ')
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  it('최대 길이 초과 거부', () => {
    const r = normalizeGovProfileMemoContent('x'.repeat(GOV_PROFILE_MEMO_MAX_LENGTH + 1))
    assert.equal(r.ok, false)
    assert.equal(r.status, 400)
  })

  it('유효 내용 허용', () => {
    const r = normalizeGovProfileMemoContent('  hello  ')
    assert.equal(r.ok, true)
    assert.equal(r.content, 'hello')
  })
})

describe('mapGovSupportProfileMemoRow', () => {
  it('DB 행을 API 형식으로 매핑', () => {
    const created = new Date('2026-05-19T10:00:00.000Z')
    const row = mapGovSupportProfileMemoRow({
      id: 7,
      profile_id: 12,
      owner_user_id: 'u1',
      content: 'memo text',
      created_by_user_id: 'u1',
      updated_by_user_id: 'u1',
      created_at: created,
      updated_at: created,
      archived_at: null,
    })
    assert.equal(row.id, '7')
    assert.equal(row.profileId, '12')
    assert.equal(row.content, 'memo text')
    assert.equal(row.createdAt, created.toISOString())
    assert.equal(row.archivedAt, null)
  })
})

describe('canAccessGovernmentProfile — memo API 권한 기준', () => {
  it('program user: 본인 owner만 허용', () => {
    const ctx = { userId: 'uA', governmentProgramUserTenantIds: ['1'] }
    assert.equal(canAccessGovernmentProfile(ctx, { tenant_id: '1', owner_user_id: 'uA' }), true)
    assert.equal(canAccessGovernmentProfile(ctx, { tenant_id: '1', owner_user_id: 'uB' }), false)
  })

  it('staff/admin: 프로필·메모 접근 불가', () => {
    const staff = {
      userId: 's1',
      governmentStaffTenantIds: ['1'],
      governmentProgramUserTenantIds: [],
    }
    const admin = {
      userId: 'a1',
      governmentAgencyAdminTenantIds: ['1'],
      governmentProgramUserTenantIds: [],
    }
    const row = { tenant_id: '1', owner_user_id: 'uA' }
    assert.equal(canAccessGovernmentProfile(staff, row), false)
    assert.equal(canAccessGovernmentProfile(admin, row), false)
  })
})
