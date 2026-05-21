import { apiRequest } from '../../../lib/apiClient'
import type {
  CreateGovernmentAdminUserBody,
  GovernmentAdminUserRow,
  PatchGovernmentAdminUserBody,
} from '../types/governmentAdminUser.types'

function unwrapData<T>(raw: unknown): T | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (Array.isArray(o.data)) return o.data as T
  if (o.data && typeof o.data === 'object') return o.data as T
  return raw as T
}

function unwrapList<T>(raw: unknown): T[] {
  const d = unwrapData<T[]>(raw)
  return Array.isArray(d) ? d : Array.isArray(raw) ? (raw as T[]) : []
}

export type GovernmentAdminUsersQuery = {
  role?: string
  tenantId?: string
  status?: string
  q?: string
}

export async function fetchGovernmentAdminUsers(
  token: string,
  query?: GovernmentAdminUsersQuery,
): Promise<GovernmentAdminUserRow[]> {
  const params = new URLSearchParams()
  if (query?.role) params.set('role', query.role)
  if (query?.tenantId) params.set('tenantId', query.tenantId)
  if (query?.status) params.set('status', query.status)
  if (query?.q) params.set('q', query.q)
  const qs = params.toString()
  const raw = await apiRequest<unknown>(
    `/api/government-support/admin/users${qs ? `?${qs}` : ''}`,
    { method: 'GET', token },
  )
  return unwrapList<GovernmentAdminUserRow>(raw)
}

export async function createGovernmentAdminUser(
  token: string,
  body: CreateGovernmentAdminUserBody,
): Promise<GovernmentAdminUserRow> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/users', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovernmentAdminUserRow>(raw)
  if (!row) throw new Error('사용자 생성에 실패했습니다.')
  return row
}

export async function patchGovernmentAdminUser(
  token: string,
  userId: string,
  body: PatchGovernmentAdminUserBody,
): Promise<GovernmentAdminUserRow> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/admin/users/${encodeURIComponent(userId)}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    },
  )
  const row = unwrapData<GovernmentAdminUserRow>(raw)
  if (!row) throw new Error('저장에 실패했습니다.')
  return row
}

export async function resetGovernmentAdminUserPassword(
  token: string,
  userId: string,
  password: string,
): Promise<void> {
  await apiRequest<unknown>(
    `/api/government-support/admin/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ password }),
    },
  )
}
