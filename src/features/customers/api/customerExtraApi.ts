import { ApiError, apiRequest } from '../../../lib/apiClient'
import {
  deleteStorageFile,
  listStorageFiles,
  presignStorageFile,
  revokeStorageStagedUpload,
  saveStorageFile,
  type StorageFilePresignResponse,
  type StorageFileRow,
} from '../../storage/api/storageApi'
import type { CustomerRecord } from '../domain/types'

export type CustomerConsultationRow = {
  id: number
  customerId: number
  userId: string
  gaId: number
  body: string
  consultationDate?: string | null
  createdAt: string
}

export type CustomerRelationRow = {
  relatedCustomerId: number
  relatedName: string
  relatedPhone: string
  createdAt: string
}

export type ConsultationCountsResponse = {
  counts: Record<string, number>
}

export type CustomerFileRow = StorageFileRow

export type SaveCustomerFilePayload = {
  fileId: number
  content: string
  fileName: string
  objectKey: string
  fileUrl: string
  size: number
  mimeType?: string | null
}

export type CustomerFilePresignResponse = StorageFilePresignResponse

function dedupeCustomersById(rows: CustomerRecord[]): CustomerRecord[] {
  const seen = new Set<number>()
  const deduped: CustomerRecord[] = []
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue
    }
    seen.add(row.id)
    deduped.push(row)
  }
  return deduped
}

export async function fetchConsultationCounts(token: string): Promise<ConsultationCountsResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<ConsultationCountsResponse>('/api/customers/consultations/counts', { token })
}

export async function listCustomerConsultations(
  token: string,
  customerId: number,
  opts?: { limit?: number; offset?: number },
): Promise<CustomerConsultationRow[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const q = new URLSearchParams()
  if (opts?.limit != null) {
    q.set('limit', String(opts.limit))
  }
  if (opts?.offset != null) {
    q.set('offset', String(opts.offset))
  }
  const suffix = q.toString() ? `?${q.toString()}` : ''
  return apiRequest<CustomerConsultationRow[]>(`/api/customers/${customerId}/consultations${suffix}`, {
    token,
  })
}

export async function createCustomerConsultation(
  token: string,
  customerId: number,
  body: string,
  opts?: { consultationDate?: string },
): Promise<CustomerConsultationRow> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const payload: { body: string; consultationDate?: string } = { body }
  const d = opts?.consultationDate?.trim()
  if (d) {
    payload.consultationDate = d
  }
  return apiRequest<CustomerConsultationRow>(`/api/customers/${customerId}/consultations`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function deleteCustomerConsultation(
  token: string,
  customerId: number,
  consultId: number,
): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ ok: boolean }>(`/api/customers/${customerId}/consultations/${consultId}`, {
    method: 'DELETE',
    token,
  })
}

export async function listCustomerRelations(
  token: string,
  customerId: number,
): Promise<CustomerRelationRow[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<CustomerRelationRow[]>(`/api/customers/${customerId}/relations`, { token })
}

export async function createCustomerRelation(
  token: string,
  customerId: number,
  relatedCustomerId: number,
): Promise<{ ok: boolean; customerId: number; relatedCustomerId: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ ok: boolean; customerId: number; relatedCustomerId: number }>(
    `/api/customers/${customerId}/relations`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({ relatedCustomerId }),
    },
  )
}

export async function deleteCustomerRelation(
  token: string,
  customerId: number,
  relatedCustomerId: number,
): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<{ ok: boolean }>(`/api/customers/${customerId}/relations/${relatedCustomerId}`, {
    method: 'DELETE',
    token,
  })
}

export async function searchCustomersAdvanced(
  token: string,
  opts: { q: string; includeRelations?: boolean; limit?: number },
): Promise<CustomerRecord[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const q = new URLSearchParams()
  q.set('q', opts.q)
  if (opts.limit != null) {
    q.set('limit', String(opts.limit))
  }
  const rows = await apiRequest<CustomerRecord[]>(`/api/customers/search/advanced?${q.toString()}`, { token })
  return dedupeCustomersById(rows)
}

export async function presignCustomerFile(
  token: string,
  customerId: number,
  body: { fileName: string; contentType: string; sizeBytes: number },
): Promise<CustomerFilePresignResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return presignStorageFile(token, {
    fileName: body.fileName,
    contentType: body.contentType,
    sizeBytes: body.sizeBytes,
    customerId,
  })
}

/** DB 저장 실패 등으로 presign·PUT 이후 R2 객체만 남은 경우 정리 */
export async function revokeStagedCustomerFileUpload(
  token: string,
  customerId: number,
  objectKey: string,
  opts?: { fileId?: number | null },
): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return revokeStorageStagedUpload(token, objectKey, { customerId, fileId: opts?.fileId ?? null })
}

export async function saveCustomerFile(
  token: string,
  customerId: number,
  body: SaveCustomerFilePayload,
): Promise<CustomerFileRow> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return saveStorageFile(token, {
    fileId: body.fileId,
    fileName: body.fileName,
    displayName: body.fileName,
    objectKey: body.objectKey,
    fileUrl: body.fileUrl,
    size: body.size,
    mimeType: body.mimeType?.trim() || null,
    content: body.content,
    customerId,
  })
}

export async function listCustomerFiles(token: string, customerId: number): Promise<CustomerFileRow[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return listStorageFiles(token, { customerId })
}

export async function deleteCustomerFile(token: string, fileId: number): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return deleteStorageFile(token, fileId)
}
