import { buildApplicationTitle } from '../domain/title'
import { createEmptyApplicationForm } from '../domain/defaults'
import type {
  InsuranceApplicationFormData,
  InsuranceApplicationRecord,
} from '../domain/types'
import { ApiError, apiRequest } from '../../../lib/apiClient'
import {
  APPLICATION_DRAFT_STORAGE_KEY,
} from './storageKeys'

interface ApplicationDraftPayload {
  userId?: string
  id?: string
  data: InsuranceApplicationFormData
  savedAt: string
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) {
    return fallback
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function mapRecord(raw: InsuranceApplicationRecord): InsuranceApplicationRecord {
  return {
    ...raw,
    title: raw.title || buildApplicationTitle(raw),
  }
}

function sanitizeFormData(payload: InsuranceApplicationFormData): InsuranceApplicationFormData {
  const sanitized = createEmptyApplicationForm()
  const keys = Object.keys(sanitized) as Array<keyof InsuranceApplicationFormData>
  for (const key of keys) {
    if (key === 'customerId') {
      const n = Number(payload.customerId)
      sanitized.customerId = Number.isInteger(n) && n > 0 ? n : 0
      continue
    }
    ;(sanitized as unknown as Record<string, string | boolean>)[key] =
      payload[key] as string | boolean
  }
  return sanitized
}

function requireBearerToken(
  token: string | null | undefined,
): asserts token is string {
  if (typeof token !== 'string' || !token.trim()) {
    throw new ApiError(
      '로그인이 필요합니다. Authorization Bearer 토큰을 보내지 않았습니다.',
      401,
    )
  }
}

export async function listApplications(token: string): Promise<InsuranceApplicationRecord[]> {
  requireBearerToken(token)
  const response = await apiRequest<InsuranceApplicationRecord[]>('/api/forms', { token })
  return response.map(mapRecord)
}

export async function listExpiringApplications(
  token: string,
): Promise<InsuranceApplicationRecord[]> {
  requireBearerToken(token)
  const response = await apiRequest<InsuranceApplicationRecord[]>('/api/forms/expiring', { token })
  return response.map(mapRecord)
}

export async function getApplicationById(
  id: string,
  token: string,
): Promise<InsuranceApplicationRecord | null> {
  requireBearerToken(token)
  try {
    const response = await apiRequest<InsuranceApplicationRecord>(`/api/forms/${id}`, { token })
    return mapRecord(response)
  } catch {
    return null
  }
}

export async function saveApplication(
  payload: InsuranceApplicationFormData,
  token: string,
  id?: string,
): Promise<InsuranceApplicationRecord> {
  requireBearerToken(token)
  const formData = sanitizeFormData(payload)
  const body = {
    customerName: formData.ownerName,
    carNumber: formData.vehicleNumber,
    formData,
  }

  if (id) {
    try {
      const response = await apiRequest<InsuranceApplicationRecord>(`/api/forms/${id}`, {
        method: 'PUT',
        token,
        body: JSON.stringify(body),
      })
      return mapRecord(response)
    } catch (error) {
      // 오래된 draft id 등으로 수정 대상이 없으면 신규 생성으로 복구한다.
      if (error instanceof ApiError && error.status === 404) {
        const created = await apiRequest<InsuranceApplicationRecord>('/api/forms', {
          method: 'POST',
          token,
          body: JSON.stringify(body),
        })
        return mapRecord(created)
      }
      throw error
    }
  }

  const response = await apiRequest<InsuranceApplicationRecord>('/api/forms', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  return mapRecord(response)
}

export async function saveApplicationAsNew(
  payload: InsuranceApplicationFormData,
  token: string,
): Promise<InsuranceApplicationRecord> {
  return saveApplication(payload, token)
}

export async function deleteApplication(id: string, token: string): Promise<void> {
  requireBearerToken(token)
  await apiRequest<void>(`/api/forms/${id}`, {
    method: 'DELETE',
    token,
  })
}

export async function renewApplication(
  id: string,
  token: string,
): Promise<InsuranceApplicationRecord> {
  requireBearerToken(token)
  const payload = await apiRequest<{ success: boolean; data: InsuranceApplicationRecord }>(
    `/api/forms/${id}/renew`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({}),
    },
  )
  return mapRecord(payload.data)
}

export function saveDraft(
  data: InsuranceApplicationFormData,
  userId?: string,
  id?: string,
): ApplicationDraftPayload {
  const draft: ApplicationDraftPayload = {
    userId,
    id,
    data,
    savedAt: new Date().toISOString(),
  }

  window.localStorage.setItem(APPLICATION_DRAFT_STORAGE_KEY, JSON.stringify(draft))
  return draft
}

export function getDraft(userId?: string): ApplicationDraftPayload | null {
  const draft = safeParse<ApplicationDraftPayload | null>(
    window.localStorage.getItem(APPLICATION_DRAFT_STORAGE_KEY),
    null,
  )

  if (!draft) {
    return null
  }

  if (!userId) {
    return draft
  }

  if (!draft.userId) {
    // 레거시 draft(사용자 식별자 없음)는 잘못된 id 복원 위험이 있어 무시한다.
    return null
  }

  return draft.userId === userId ? draft : null
}

export function clearDraft(): void {
  window.localStorage.removeItem(APPLICATION_DRAFT_STORAGE_KEY)
}
