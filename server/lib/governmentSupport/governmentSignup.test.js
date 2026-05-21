import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  GOVERNMENT_PROGRAM_USER_ROLE,
  isGovernmentIndustrySignup,
} from './governmentSignup.js'

describe('governmentSignup', () => {
  it('isGovernmentIndustrySignup', () => {
    assert.equal(isGovernmentIndustrySignup('government'), true)
    assert.equal(isGovernmentIndustrySignup('insurance'), false)
  })

  it('program user role constant', () => {
    assert.equal(GOVERNMENT_PROGRAM_USER_ROLE, 'government_user')
  })
})
