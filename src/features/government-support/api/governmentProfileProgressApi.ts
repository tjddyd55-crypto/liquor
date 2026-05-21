import { apiRequest } from '../../../lib/apiClient'
import type { GovProfileProgressEvent } from '../types/governmentProfile.types'

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

export async function fetchGovProfileProgressEvents(
  token: string,
  profileId: string,
  opts?: { limit?: number; offset?: number },
): Promise<GovProfileProgressEvent[]> {
  const q = new URLSearchParams()
  if (opts?.limit != null) q.set('limit', String(opts.limit))
  if (opts?.offset != null) q.set('offset', String(opts.offset))
  const suffix = q.toString() ? `?${q.toString()}` : ''
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/progress${suffix}`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovProfileProgressEvent>(raw)
}

export async function createGovProfileProgressEvent(
  token: string,
  profileId: string,
  body: {
    status: string
    content: string
    title?: string
    eventDate?: string
  },
): Promise<GovProfileProgressEvent> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/progress`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovProfileProgressEvent>(raw)
  if (!row) throw new Error('진행상황 저장에 실패했습니다.')
  return row
}

export async function patchGovProfileProgressEvent(
  token: string,
  profileId: string,
  progressId: string,
  patch: { status?: string; content?: string; title?: string; eventDate?: string },
): Promise<GovProfileProgressEvent> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/progress/${progressId}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify(patch),
    },
  )
  const row = unwrapData<GovProfileProgressEvent>(raw)
  if (!row) throw new Error('진행상황 수정에 실패했습니다.')
  return row
}

export async function deleteGovProfileProgressEvent(
  token: string,
  profileId: string,
  progressId: string,
): Promise<{ ok: boolean }> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/progress/${progressId}`,
    { method: 'DELETE', token },
  )
  const data = unwrapData<{ ok?: boolean }>(raw)
  return { ok: data?.ok ?? true }
}
