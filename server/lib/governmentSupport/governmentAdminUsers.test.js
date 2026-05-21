import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isGovernmentUserManager,
  membershipInsertParams,
  parseGovernmentEntityStatus,
  parseGovernmentMembershipRole,
} from './governmentAdminUsers.js'

describe('governmentAdminUsers helpers', () => {
  it('isGovernmentUserManager: industry admin', () => {
    assert.equal(
      isGovernmentUserManager({ governmentIndustryAdminIndustryIds: ['1'] }),
      true,
    )
  })

  it('isGovernmentUserManager: agency admin', () => {
    assert.equal(
      isGovernmentUserManager({ governmentAgencyAdminTenantIds: ['10'] }),
      true,
    )
  })

  it('isGovernmentUserManager: staff only → false', () => {
    assert.equal(
      isGovernmentUserManager({ governmentStaffTenantIds: ['10'] }),
      false,
    )
  })

  it('parseGovernmentMembershipRole', () => {
    assert.equal(parseGovernmentMembershipRole('government_staff'), 'government_staff')
    assert.equal(parseGovernmentMembershipRole('government_user'), 'government_user')
    assert.equal(parseGovernmentMembershipRole('invalid'), null)
  })

  it('parseGovernmentEntityStatus', () => {
    assert.equal(parseGovernmentEntityStatus('blocked'), 'blocked')
    assert.equal(parseGovernmentEntityStatus('nope'), null)
  })

  it('membershipInsertParams for tenant staff', () => {
    const spec = membershipInsertParams('government_staff', '42', '3')
    assert.equal(spec.role, 'government_staff')
    assert.equal(spec.scope_type, 'tenant')
    assert.equal(spec.scope_id, '42')
    assert.equal(spec.tenant_id, '42')
    assert.equal(spec.customer_access, 'assigned')
  })

  it('membershipInsertParams for industry admin', () => {
    const spec = membershipInsertParams('government_industry_admin', null, '3')
    assert.equal(spec.scope_type, 'industry')
    assert.equal(spec.scope_id, '3')
    assert.equal(spec.tenant_id, null)
  })
})
