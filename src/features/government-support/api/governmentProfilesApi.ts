import { apiRequest } from '../../../lib/apiClient'
import type { GovAgencyRow, GovApplicationCase, GovPriorLoan, GovSupportProfile } from '../types/governmentProfile.types'

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

export async function fetchGovAgencies(token: string): Promise<GovAgencyRow[]> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/agencies', { method: 'GET', token })
  return unwrapList<GovAgencyRow>(raw)
}

export async function createGovAgency(
  token: string,
  body: { name: string; agencyCode: string; status?: string },
): Promise<GovAgencyRow> {
  const raw = await apiRequest<unknown>('/api/government-support/admin/agencies', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovAgencyRow>(raw)
  if (!row) throw new Error('대행사 등록에 실패했습니다.')
  return row
}

export async function fetchGovProfiles(token: string): Promise<GovSupportProfile[]> {
  const raw = await apiRequest<unknown>('/api/government-support/profiles', { method: 'GET', token })
  return unwrapList<GovSupportProfile>(raw)
}

export async function createGovProfile(
  token: string,
  tenantId: string | null | undefined,
  partial?: Partial<GovSupportProfile>,
) {
  const raw = await apiRequest<unknown>('/api/government-support/profiles', {
    method: 'POST',
    token,
    body: JSON.stringify({
      ...(tenantId ? { tenantId } : {}),
      customerName: '신규 고객',
      ...partial,
    }),
  })
  const row = unwrapData<GovSupportProfile>(raw)
  if (!row) throw new Error('고객 생성에 실패했습니다.')
  return row
}

export async function patchGovProfile(token: string, profileId: string, patch: Partial<GovSupportProfile>) {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch),
  })
  const row = unwrapData<GovSupportProfile>(raw)
  if (!row) throw new Error('저장에 실패했습니다.')
  return row
}

export async function fetchGovPriorLoans(token: string, profileId: string): Promise<GovPriorLoan[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/prior-loans`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovPriorLoan>(raw)
}

export async function createGovPriorLoan(token: string, profileId: string, body: Partial<GovPriorLoan>) {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/prior-loans`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  return unwrapData<{ id: string }>(raw)
}

export async function patchGovPriorLoan(token: string, loanId: string, body: Partial<GovPriorLoan>) {
  const raw = await apiRequest<unknown>(`/api/government-support/prior-loans/${loanId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
  return unwrapData<{ id: string }>(raw)
}

export async function deleteGovPriorLoan(token: string, loanId: string) {
  await apiRequest(`/api/government-support/prior-loans/${loanId}`, { method: 'DELETE', token })
}

export async function fetchGovApplicationCases(token: string, profileId: string): Promise<GovApplicationCase[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/application-cases`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovApplicationCase>(raw)
}

export async function createGovApplicationCase(token: string, profileId: string, body: Partial<GovApplicationCase>) {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/application-cases`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  return unwrapData<{ id: string; progressStatus: string }>(raw)
}

export async function patchGovApplicationCase(token: string, caseId: string, body: Partial<GovApplicationCase>) {
  const raw = await apiRequest<unknown>(`/api/government-support/application-cases/${caseId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
  return unwrapData<{ id: string; progressStatus: string }>(raw)
}
