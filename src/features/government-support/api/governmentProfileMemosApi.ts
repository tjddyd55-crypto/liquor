import { apiRequest } from '../../../lib/apiClient'
import type { GovProfileMemo } from '../types/governmentProfile.types'

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

export async function fetchGovProfileMemos(token: string, profileId: string): Promise<GovProfileMemo[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/memos`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovProfileMemo>(raw)
}

export async function createGovProfileMemo(token: string, profileId: string, content: string): Promise<GovProfileMemo> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/memos`, {
    method: 'POST',
    token,
    body: JSON.stringify({ content }),
  })
  const row = unwrapData<GovProfileMemo>(raw)
  if (!row) throw new Error('메모 저장에 실패했습니다.')
  return row
}

export async function patchGovProfileMemo(
  token: string,
  profileId: string,
  memoId: string,
  content: string,
): Promise<GovProfileMemo> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/memos/${memoId}`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ content }),
    },
  )
  const row = unwrapData<GovProfileMemo>(raw)
  if (!row) throw new Error('메모 수정에 실패했습니다.')
  return row
}

export async function deleteGovProfileMemo(token: string, profileId: string, memoId: string): Promise<void> {
  await apiRequest(`/api/government-support/profiles/${profileId}/memos/${memoId}`, {
    method: 'DELETE',
    token,
  })
}
