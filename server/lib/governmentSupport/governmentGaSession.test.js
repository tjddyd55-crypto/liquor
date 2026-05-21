import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

/** src/features/government-support/lib/isGovernmentGaSession.ts 와 동일 정책 */
const GOVERNMENT_CRM_GA_CODE = 'GOVERNMENT_CRM'

function isGovernmentGaSession(user) {
  return (
    String(user?.gaCode ?? '')
      .trim()
      .toUpperCase() === GOVERNMENT_CRM_GA_CODE
  )
}

describe('isGovernmentGaSession (policy mirror)', () => {
  it('GOVERNMENT_CRM GA', () => {
    assert.equal(isGovernmentGaSession({ gaCode: 'GOVERNMENT_CRM' }), true)
    assert.equal(isGovernmentGaSession({ gaCode: 'government_crm' }), true)
  })

  it('보험 GA 제외', () => {
    assert.equal(isGovernmentGaSession({ gaCode: 'YJASSET' }), false)
    assert.equal(isGovernmentGaSession({ gaCode: '' }), false)
  })
})

describe('resolveGovernmentHomePath policy mirror', () => {
  function resolveGovernmentHomePath(summary) {
    if (!summary) return '/government/login'
    if (summary.isGovernmentProgramUser) return '/government/workspace'
    if (summary.isSuperAdmin || summary.isGovernmentIndustryAdmin) return '/government/admin/agencies'
    if ((summary.governmentAgencyAdminTenantIds?.length ?? 0) > 0) return '/government/admin/users'
    if ((summary.governmentStaffTenantIds?.length ?? 0) > 0) return '/government/admin/notices'
    return '/government/admin/notices'
  }

  it('role별 redirect', () => {
    assert.equal(
      resolveGovernmentHomePath({ isGovernmentIndustryAdmin: true, isGovernmentProgramUser: false }),
      '/government/admin/agencies',
    )
    assert.equal(
      resolveGovernmentHomePath({
        isGovernmentIndustryAdmin: false,
        isGovernmentProgramUser: false,
        governmentAgencyAdminTenantIds: ['1'],
      }),
      '/government/admin/users',
    )
    assert.equal(
      resolveGovernmentHomePath({
        isGovernmentIndustryAdmin: false,
        isGovernmentProgramUser: false,
        governmentStaffTenantIds: ['1'],
      }),
      '/government/admin/notices',
    )
    assert.equal(
      resolveGovernmentHomePath({ isGovernmentProgramUser: true }),
      '/government/workspace',
    )
  })
})
