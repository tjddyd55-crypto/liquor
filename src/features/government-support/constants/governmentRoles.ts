/** DB industries.code */
export const GOVERNMENT_INDUSTRY_CODE = 'government' as const

/** user_memberships.role (snake_case, server platformRbac 와 동일) */
export const GOVERNMENT_MEMBERSHIP_ROLES = [
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
  'government_user',
] as const

/** 관리자 화면에서 직접 생성 가능한 역할 */
export const GOVERNMENT_STAFF_MANAGEABLE_ROLES = [
  'government_industry_admin',
  'government_agency_admin',
  'government_staff',
] as const

export type GovernmentMembershipRole = (typeof GOVERNMENT_MEMBERSHIP_ROLES)[number]

export type GovernmentStaffManageableRole = (typeof GOVERNMENT_STAFF_MANAGEABLE_ROLES)[number]

export const GOVERNMENT_ROLE_LABELS: Record<GovernmentMembershipRole, string> = {
  government_industry_admin: '전체 관리자',
  government_agency_admin: '대행사 관리자',
  government_staff: '대행사 직원',
  government_user: '이용자',
}
