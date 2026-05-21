import type { GovernmentMembershipRole } from '../constants/governmentRoles'

export type GovernmentUserEntityStatus = 'active' | 'blocked' | 'inactive'

export type GovernmentAdminUserRow = {
  id: string
  username: string
  displayName: string
  role: GovernmentMembershipRole
  tenantId: string | null
  tenantName: string | null
  agencyCode: string | null
  status: GovernmentUserEntityStatus
  createdAt: string | null
  lastLoginAt: string | null
}

export type CreateGovernmentAdminUserBody = {
  username: string
  password: string
  displayName: string
  role: GovernmentMembershipRole
  tenantId?: string
}

export type PatchGovernmentAdminUserBody = {
  displayName?: string
  role?: GovernmentMembershipRole
  tenantId?: string
  status?: GovernmentUserEntityStatus
}
