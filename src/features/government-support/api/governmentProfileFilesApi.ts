import { apiRequest } from '../../../lib/apiClient'
import type { GovProfileFile } from '../types/governmentProfile.types'

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

export type GovProfileFilePresignResponse = {
  id: string
  fileId: string
  uploadUrl: string
  objectKey: string
  fileKey: string
  putHeaders?: Record<string, string>
  fileName: string
  profileId: string
}

export async function fetchGovProfileFiles(token: string, profileId: string): Promise<GovProfileFile[]> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/files`, {
    method: 'GET',
    token,
  })
  return unwrapList<GovProfileFile>(raw)
}

export async function presignGovProfileFile(
  token: string,
  profileId: string,
  body: { fileName: string; contentType: string; sizeBytes: number; category?: string; description?: string },
): Promise<GovProfileFilePresignResponse> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/files/presign`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovProfileFilePresignResponse>(raw)
  if (!row?.uploadUrl) throw new Error('업로드 준비에 실패했습니다.')
  return row
}

export async function saveGovProfileFile(
  token: string,
  profileId: string,
  body: {
    fileId: string
    objectKey: string
    fileName: string
    size: number
    mimeType: string
  },
): Promise<GovProfileFile> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/files`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  const row = unwrapData<GovProfileFile>(raw)
  if (!row) throw new Error('파일 저장에 실패했습니다.')
  return row
}

export async function getGovProfileFileDownloadUrl(
  token: string,
  profileId: string,
  fileId: string,
): Promise<string> {
  const raw = await apiRequest<unknown>(
    `/api/government-support/profiles/${profileId}/files/${fileId}/download`,
    { method: 'GET', token },
  )
  const data = unwrapData<{ downloadUrl?: string; url?: string }>(raw)
  const url = data?.downloadUrl ?? data?.url ?? ''
  if (!url) throw new Error('다운로드 URL을 만들 수 없습니다.')
  return url
}

export async function patchGovProfileFile(
  token: string,
  profileId: string,
  fileId: string,
  patch: { fileName?: string; description?: string; category?: string },
): Promise<GovProfileFile> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/files/${fileId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(patch),
  })
  const row = unwrapData<GovProfileFile>(raw)
  if (!row) throw new Error('파일 수정에 실패했습니다.')
  return row
}

export async function deleteGovProfileFile(
  token: string,
  profileId: string,
  fileId: string,
): Promise<{ ok: boolean }> {
  const raw = await apiRequest<unknown>(`/api/government-support/profiles/${profileId}/files/${fileId}`, {
    method: 'DELETE',
    token,
  })
  const data = unwrapData<{ ok?: boolean }>(raw)
  return { ok: data?.ok ?? true }
}

/** StorageFileList 호환 매핑 */
export function govProfileFileToStorageRow(file: GovProfileFile) {
  const idNum = Number(file.id)
  return {
    id: Number.isFinite(idNum) ? idNum : 0,
    customerId: null,
    teamId: null,
    folderId: null,
    content: file.description ?? '',
    fileName: file.fileName,
    originalName: file.fileName,
    displayName: file.fileName,
    objectKey: file.fileKey,
    filePath: file.fileKey,
    fileUrl: '',
    fileSize: file.fileSize,
    mimeType: file.mimeType,
    isConfirmed: file.uploadStatus === 'active',
    uploadStatus: file.uploadStatus,
    createdAt: file.createdAt,
    expiresAt: null,
    deletedAt: file.archivedAt,
    govFileId: file.id,
  }
}

export type GovStorageFileRow = ReturnType<typeof govProfileFileToStorageRow>
