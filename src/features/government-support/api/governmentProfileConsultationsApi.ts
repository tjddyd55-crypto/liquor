import { apiRequest } from '../../../lib/apiClient'
import type { GovProfileConsultation } from '../types/governmentProfile.types'

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

export async function fetchGovProfileConsultations(
  token: string,
  profileId: string,
  opts?: { limit?: number; offset?: number },
): Promise<GovProfileConsultation[]> {
  const q = new URLSearchParams()
  if (opts?.limit != null) q.set('limit', String(opts.limit))
  if (opts?.offset != null) q.set('offset', String(opts.offset))
  const suffix = q.toString() ? `?${q.toString()}` : ''
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/consultations${suffix}`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovProfileConsultation>(raw)
}

export async function createGovProfileConsultation(
  token: string,
  profileId: string,
  body: string,
  opts?: { consultationDate?: string },
): Promise<GovProfileConsultation> {
  const payload: { body: string; consultationDate?: string } = { body }
  const d = opts?.consultationDate?.trim()
  if (d) payload.consultationDate = d
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/consultations`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
  const row = unwrapData<GovProfileConsultation>(raw)
  if (!row) throw new Error('상담 저장에 실패했습니다.')
  return row
}

export async function patchGovProfileConsultation(
  token: string,
  profileId: string,
  consultationId: string,
  patch: { body?: string; consultationDate?: string },
): Promise<GovProfileConsultation> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/consultations/${consultationId}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    },
  )
  const row = unwrapData<GovProfileConsultation>(raw)
  if (!row) throw new Error('상담 수정에 실패했습니다.')
  return row
}

export async function deleteGovProfileConsultation(
  token: string,
  profileId: string,
  consultationId: string,
): Promise<{ ok: boolean }> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/consultations/${consultationId}`,
    { method: 'DELETE', token },
  )
  const data = unwrapData<{ ok?: boolean }>(raw)
  return { ok: data?.ok ?? true }
}
