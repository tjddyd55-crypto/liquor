/** government-support 업종 코드 (DB industries.code) */
export const GOVERNMENT_INDUSTRY_CODE = 'government'

/** user_memberships.role — government-support 전용 */
export const GOVERNMENT_MEMBERSHIP_ROLES = Object.freeze([
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
  'government_user',
])

/** 관리자 화면에서 직접 생성 가능한 역할(이용자는 기관 코드 가입 전용) */
export const GOVERNMENT_STAFF_MANAGEABLE_ROLES = Object.freeze([
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
])

export const GOVERNMENT_MEMBERSHIP_ROLE_SET = new Set(GOVERNMENT_MEMBERSHIP_ROLES)
