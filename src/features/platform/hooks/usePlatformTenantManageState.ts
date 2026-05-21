import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import {
  createPlatformTenantStaffUser,
  createTenantRegistrationCode,
  fetchPlatformTenantStaffUsers,
  fetchPlatformTenantSummary,
  fetchTenantRegistrationCodes,
  patchPlatformTenantStaffUser,
  patchTenantRegistrationCode,
} from '../api/platformAdminApi'
import type { PlatformTenantRegistrationCode, PlatformTenantRow, PlatformTenantStaffUser } from '../platformAdmin.types'

const TENANT_ID_RE = /^[1-9]\d*$/

export type PlatformTenantMemberEditRow = {
  rbacRole: string
  membershipType: string
  customerAccess: string
  membershipStatus: string
  userAccountStatus: string
}

export type PlatformTenantManageViewProps = {
  tenantId: string
  tenantIdValid: boolean
  tenant: PlatformTenantRow | null
  tenantLoading: boolean
  tenantError: string | null
  registrationCodes: PlatformTenantRegistrationCode[]
  codesLoading: boolean
  codesError: string | null
  newRegCode: string
  setNewRegCode: (v: string) => void
  newRegMaxUses: string
  setNewRegMaxUses: (v: string) => void
  newRegExpires: string
  setNewRegExpires: (v: string) => void
  regCreateSubmitting: boolean
  regCreateError: string | null
  onCreateRegistrationCode: () => void
  onDeactivateRegistrationCode: (code: PlatformTenantRegistrationCode) => void
  staffUsers: PlatformTenantStaffUser[]
  usersLoading: boolean
  usersError: string | null
  memberEdits: Record<string, PlatformTenantMemberEditRow>
  onMemberFieldChange: (userId: string, field: keyof PlatformTenantMemberEditRow, value: string) => void
  onSaveMemberRow: (userId: string) => void
  memberRowSaving: Record<string, boolean>
  newUserUsername: string
  setNewUserUsername: (v: string) => void
  newUserDisplayName: string
  setNewUserDisplayName: (v: string) => void
  newUserPassword: string
  setNewUserPassword: (v: string) => void
  newUserRbac: 'staff' | 'user' | 'tenant_admin'
  setNewUserRbac: (v: 'staff' | 'user' | 'tenant_admin') => void
  newUserMembershipType: 'agent' | 'staff' | 'admin' | 'owner'
  setNewUserMembershipType: (v: 'agent' | 'staff' | 'admin' | 'owner') => void
  newUserCustomerAccess: 'none' | 'own' | 'tenant' | 'assigned'
  setNewUserCustomerAccess: (v: 'none' | 'own' | 'tenant' | 'assigned') => void
  newUserSubmitting: boolean
  newUserError: string | null
  onCreateStaffUser: () => void
  reloadAll: () => void
}

function mapUserToEdit(u: PlatformTenantStaffUser): PlatformTenantMemberEditRow {
  return {
    rbacRole: String(u.membershipRole ?? '').trim().toLowerCase() || 'user',
    membershipType: String(u.membershipType ?? 'agent').trim().toLowerCase() || 'agent',
    customerAccess: String(u.customerAccess ?? 'own').trim().toLowerCase() || 'own',
    membershipStatus: String(u.status ?? 'active').trim().toLowerCase() || 'active',
    userAccountStatus: String(u.userAccountStatus ?? 'active').trim().toLowerCase() || 'active',
  }
}

export function usePlatformTenantManageState(tenantIdRaw: string): PlatformTenantManageViewProps {
  const { token } = useAuth()

  const tenantId = String(tenantIdRaw ?? '').trim()
  const tenantIdValid = TENANT_ID_RE.test(tenantId)

  const [tenant, setTenant] = useState<PlatformTenantRow | null>(null)
  const [tenantLoading, setTenantLoading] = useState(false)
  const [tenantError, setTenantError] = useState<string | null>(null)

  const [registrationCodes, setRegistrationCodes] = useState<PlatformTenantRegistrationCode[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [codesError, setCodesError] = useState<string | null>(null)

  const [newRegCode, setNewRegCode] = useState('')
  const [newRegMaxUses, setNewRegMaxUses] = useState('')
  const [newRegExpires, setNewRegExpires] = useState('')
  const [regCreateSubmitting, setRegCreateSubmitting] = useState(false)
  const [regCreateError, setRegCreateError] = useState<string | null>(null)

  const [staffUsers, setStaffUsers] = useState<PlatformTenantStaffUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState<string | null>(null)
  const [memberEdits, setMemberEdits] = useState<Record<string, PlatformTenantMemberEditRow>>({})
  const [memberRowSaving, setMemberRowSaving] = useState<Record<string, boolean>>({})

  const [newUserUsername, setNewUserUsername] = useState('')
  const [newUserDisplayName, setNewUserDisplayName] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRbac, setNewUserRbac] = useState<'staff' | 'user' | 'tenant_admin'>('staff')
  const [newUserMembershipType, setNewUserMembershipType] = useState<'agent' | 'staff' | 'admin' | 'owner'>('staff')
  const [newUserCustomerAccess, setNewUserCustomerAccess] = useState<'none' | 'own' | 'tenant' | 'assigned'>('none')
  const [newUserSubmitting, setNewUserSubmitting] = useState(false)
  const [newUserError, setNewUserError] = useState<string | null>(null)

  const reloadTenant = useCallback(async () => {
    if (!token || !tenantIdValid) return
    setTenantLoading(true)
    setTenantError(null)
    try {
      const row = await fetchPlatformTenantSummary(token, tenantId)
      setTenant(row)
    } catch (e) {
      setTenant(null)
      setTenantError(e instanceof ApiError ? e.message : '테넌트 정보를 불러오지 못했습니다.')
    } finally {
      setTenantLoading(false)
    }
  }, [token, tenantId, tenantIdValid])

  const reloadCodes = useCallback(async () => {
    if (!token || !tenantIdValid) return
    setCodesLoading(true)
    setCodesError(null)
    try {
      const r = await fetchTenantRegistrationCodes(token, tenantId)
      setRegistrationCodes(r.items)
    } catch (e) {
      setRegistrationCodes([])
      setCodesError(e instanceof ApiError ? e.message : '가입 코드 목록을 불러오지 못했습니다.')
    } finally {
      setCodesLoading(false)
    }
  }, [token, tenantId, tenantIdValid])

  const reloadUsers = useCallback(async () => {
    if (!token || !tenantIdValid) return
    setUsersLoading(true)
    setUsersError(null)
    try {
      const r = await fetchPlatformTenantStaffUsers(token, tenantId)
      setStaffUsers(r.items)
      setMemberEdits(
        Object.fromEntries(r.items.map((u) => [u.userId, mapUserToEdit(u)] satisfies [string, PlatformTenantMemberEditRow])),
      )
    } catch (e) {
      setStaffUsers([])
      setMemberEdits({})
      setUsersError(e instanceof ApiError ? e.message : '사용자 목록을 불러오지 못했습니다.')
    } finally {
      setUsersLoading(false)
    }
  }, [token, tenantId, tenantIdValid])

  const reloadAll = useCallback(() => {
    void reloadTenant()
    void reloadCodes()
    void reloadUsers()
  }, [reloadCodes, reloadTenant, reloadUsers])

  useEffect(() => {
    if (!tenantIdValid) return
    reloadAll()
  }, [tenantIdValid, reloadAll])

  const onCreateRegistrationCode = useCallback(async () => {
    if (!token || !tenantIdValid) return
    setRegCreateSubmitting(true)
    setRegCreateError(null)
    try {
      const maxUsesParsed =
        newRegMaxUses.trim() === '' ? null : (Number(newRegMaxUses) as number)
      if (maxUsesParsed != null && (!Number.isInteger(maxUsesParsed) || maxUsesParsed < 0)) {
        setRegCreateError('max uses는 0 이상의 정수로 입력하거나 비워 두세요.')
        return
      }
      const expRaw = newRegExpires.trim()
      await createTenantRegistrationCode(token, tenantId, {
        code: newRegCode,
        maxUses: maxUsesParsed,
        expiresAt: expRaw ? new Date(expRaw).toISOString() : null,
      })
      setNewRegCode('')
      setNewRegMaxUses('')
      setNewRegExpires('')
      await reloadCodes()
    } catch (e) {
      setRegCreateError(e instanceof ApiError ? e.message : '가입 코드 생성에 실패했습니다.')
    } finally {
      setRegCreateSubmitting(false)
    }
  }, [newRegCode, newRegExpires, newRegMaxUses, reloadCodes, tenantId, tenantIdValid, token])

  const onDeactivateRegistrationCode = useCallback(
    async (code: PlatformTenantRegistrationCode) => {
      if (!token || !tenantIdValid) return
      await patchTenantRegistrationCode(token, tenantId, code.id, { status: 'inactive' })
      await reloadCodes()
    },
    [reloadCodes, tenantId, tenantIdValid, token],
  )

  const onMemberFieldChange = useCallback(
    (userId: string, field: keyof PlatformTenantMemberEditRow, value: string) => {
      setMemberEdits((prev) => {
        const cur = prev[userId]
        if (!cur) return prev
        return { ...prev, [userId]: { ...cur, [field]: value } }
      })
    },
    [],
  )

  const onSaveMemberRow = useCallback(
    async (userId: string) => {
      if (!token || !tenantIdValid) return
      const d = memberEdits[userId]
      if (!d) return
      setMemberRowSaving((s) => ({ ...s, [userId]: true }))
      try {
        await patchPlatformTenantStaffUser(token, tenantId, userId, {
          rbacRole: d.rbacRole as 'staff' | 'user' | 'tenant_admin',
          membershipType: d.membershipType as 'agent' | 'staff' | 'admin' | 'owner',
          customerAccess: d.customerAccess as 'none' | 'own' | 'tenant' | 'assigned',
          status: d.userAccountStatus as 'active' | 'inactive' | 'blocked',
          membershipStatus: d.membershipStatus as 'active' | 'inactive',
        })
        await reloadUsers()
      } finally {
        setMemberRowSaving((s) => {
          const n = { ...s }
          delete n[userId]
          return n
        })
      }
    },
    [memberEdits, reloadUsers, tenantId, tenantIdValid, token],
  )

  const onCreateStaffUser = useCallback(async () => {
    if (!token || !tenantIdValid) return
    setNewUserSubmitting(true)
    setNewUserError(null)
    try {
      if (!newUserUsername.trim() || newUserUsername.trim().length < 3) {
        setNewUserError('아이디는 3글자 이상입니다.')
        return
      }
      if (!newUserDisplayName.trim()) {
        setNewUserError('이름을 입력해 주세요.')
        return
      }
      if (newUserPassword.trim().length < 8) {
        setNewUserError('임시 비밀번호는 8자 이상입니다.')
        return
      }
      await createPlatformTenantStaffUser(token, tenantId, {
        username: newUserUsername.trim().toLowerCase(),
        displayName: newUserDisplayName.trim(),
        password: newUserPassword,
        rbacRole: newUserRbac,
        membershipType: newUserMembershipType,
        customerAccess: newUserCustomerAccess,
      })
      setNewUserUsername('')
      setNewUserDisplayName('')
      setNewUserPassword('')
      setNewUserRbac('staff')
      setNewUserMembershipType('staff')
      setNewUserCustomerAccess('none')
      await reloadUsers()
    } catch (e) {
      setNewUserError(e instanceof ApiError ? e.message : '사용자 생성에 실패했습니다.')
    } finally {
      setNewUserSubmitting(false)
    }
  }, [
    newUserCustomerAccess,
    newUserDisplayName,
    newUserMembershipType,
    newUserPassword,
    newUserRbac,
    newUserUsername,
    reloadUsers,
    tenantId,
    tenantIdValid,
    token,
  ])

  return {
    tenantId,
    tenantIdValid,
    tenant,
    tenantLoading,
    tenantError,
    registrationCodes,
    codesLoading,
    codesError,
    newRegCode,
    setNewRegCode,
    newRegMaxUses,
    setNewRegMaxUses,
    newRegExpires,
    setNewRegExpires,
    regCreateSubmitting,
    regCreateError,
    onCreateRegistrationCode,
    onDeactivateRegistrationCode,
    staffUsers,
    usersLoading,
    usersError,
    memberEdits,
    onMemberFieldChange,
    onSaveMemberRow,
    memberRowSaving,
    newUserUsername,
    setNewUserUsername,
    newUserDisplayName,
    setNewUserDisplayName,
    newUserPassword,
    setNewUserPassword,
    newUserRbac,
    setNewUserRbac,
    newUserMembershipType,
    setNewUserMembershipType,
    newUserCustomerAccess,
    setNewUserCustomerAccess,
    newUserSubmitting,
    newUserError,
    onCreateStaffUser,
    reloadAll,
  }
}