import { ApiError, apiRequest } from '../../lib/apiClient'
import type { InsurerManager, InsurerManagerStatus } from '../insurer-managers/types'

export async function listLossAdjustersApi(token: string): Promise<InsurerManager[]> {
  return apiRequest<InsurerManager[]>('/api/loss-adjusters', { method: 'GET', token })
}

export async function createLossAdjusterApi(
  token: string,
  payload: {
    companyName: string
    adjusterName: string
    username: string
    password: string
  },
): Promise<InsurerManager> {
  try {
    return await apiRequest<InsurerManager>('/api/loss-adjusters', {
      method: 'POST',
      token,
      body: JSON.stringify({
        companyName: payload.companyName.trim(),
        adjusterName: payload.adjusterName.trim(),
        username: payload.username.trim(),
        password: payload.password,
      }),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error(error.message || '등록할 수 없습니다.')
    }
    throw error
  }
}

export async function patchLossAdjusterApi(
  token: string,
  id: string,
  payload: {
    companyName?: string
    adjusterName?: string
    username?: string
    password?: string
    status?: InsurerManagerStatus
  },
): Promise<InsurerManager> {
  try {
    const body: Record<string, unknown> = {}
    if (payload.companyName != null) {
      body.companyName = payload.companyName.trim()
    }
    if (payload.adjusterName != null) {
      body.adjusterName = payload.adjusterName.trim()
    }
    if (payload.username != null) {
      body.username = payload.username.trim()
    }
    if (payload.status != null) {
      body.status = payload.status
    }
    if (payload.password != null && payload.password.trim() !== '') {
      body.password = payload.password
    }
    return await apiRequest<InsurerManager>(`/api/loss-adjusters/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      throw new Error(error.message || '수정할 수 없습니다.')
    }
    throw error
  }
}

export async function deleteLossAdjusterApi(token: string, id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>(`/api/loss-adjusters/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  })
}
