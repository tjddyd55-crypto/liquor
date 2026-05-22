import { apiRequest } from '../../../lib/apiClient'

export type LiquorFileLinkTarget = 'customer' | 'support_contract' | 'repayment' | 'support_item' | 'other'

export type LiquorCustomerFile = {
  id: number
  customerId: number
  supportContractId: number | null
  repaymentId: number | null
  supportItemId: number | null
  documentKind: string
  fileId: number
  title: string
  memo: string
  uploadedByUserId: string | null
  uploadedByName: string
  fileName: string
  originalName: string
  fileSize: number
  mimeType: string
  fileStatus: string
  createdAt: string
  linkTarget: LiquorFileLinkTarget
}

export type LiquorCustomerFileUploadInput = {
  documentKind: string
  title?: string
  memo?: string
  linkTarget?: LiquorFileLinkTarget
  targetId?: number | null
  supportContractId?: number | null
  repaymentId?: number | null
  supportItemId?: number | null
}

type PresignResponse = {
  fileId: number
  uploadUrl: string
  objectKey: string
  putHeaders?: Record<string, string>
  fileName: string
}

function inferLinkTarget(row: Record<string, unknown>): LiquorFileLinkTarget {
  if (row.support_contract_id != null || row.supportContractId != null) return 'support_contract'
  if (row.repayment_id != null || row.repaymentId != null) return 'repayment'
  if (row.support_item_id != null || row.supportItemId != null) return 'support_item'
  return 'customer'
}

export function mapLiquorCustomerFile(row: Record<string, unknown>): LiquorCustomerFile {
  const supportContractId =
    row.supportContractId != null
      ? Number(row.supportContractId)
      : row.support_contract_id != null
        ? Number(row.support_contract_id)
        : null
  const repaymentId =
    row.repaymentId != null ? Number(row.repaymentId) : row.repayment_id != null ? Number(row.repayment_id) : null
  const supportItemId =
    row.supportItemId != null
      ? Number(row.supportItemId)
      : row.support_item_id != null
        ? Number(row.support_item_id)
        : null

  return {
    id: Number(row.id),
    customerId: Number(row.customerId ?? row.customer_id),
    supportContractId: Number.isFinite(supportContractId) ? supportContractId : null,
    repaymentId: Number.isFinite(repaymentId) ? repaymentId : null,
    supportItemId: Number.isFinite(supportItemId) ? supportItemId : null,
    documentKind: String(row.documentKind ?? row.document_kind ?? 'other'),
    fileId: Number(row.fileId ?? row.file_id),
    title: String(row.title ?? ''),
    memo: String(row.memo ?? ''),
    uploadedByUserId:
      row.uploadedByUserId != null
        ? String(row.uploadedByUserId)
        : row.uploaded_by_user_id != null
          ? String(row.uploaded_by_user_id)
          : null,
    uploadedByName: String(row.uploadedByName ?? row.uploaded_by_name ?? ''),
    fileName: String(row.fileName ?? row.file_name ?? row.originalName ?? row.original_name ?? ''),
    originalName: String(row.originalName ?? row.original_name ?? row.fileName ?? ''),
    fileSize: Number(row.fileSize ?? row.file_size ?? 0),
    mimeType: String(row.mimeType ?? row.mime_type ?? ''),
    fileStatus: String(row.fileStatus ?? row.file_status ?? 'active'),
    createdAt: String(row.createdAt ?? row.created_at ?? ''),
    linkTarget: inferLinkTarget(row),
  }
}

export async function presignLiquorCustomerFile(
  token: string,
  customerId: number,
  body: { fileName: string; contentType: string; sizeBytes: number },
): Promise<PresignResponse> {
  const res = await apiRequest<{ ok?: boolean; data?: PresignResponse }>(
    `/api/liquor/customers/${customerId}/files/presign`,
    { method: 'POST', token, body },
  )
  return res.data!
}

export async function confirmLiquorCustomerFile(
  token: string,
  customerId: number,
  body: {
    fileId: number
    objectKey: string
    fileName: string
    size: number
    mimeType: string
    documentKind: string
    title?: string
    memo?: string
    linkTarget?: LiquorFileLinkTarget
    targetId?: number | null
    supportContractId?: number | null
    repaymentId?: number | null
    supportItemId?: number | null
  },
): Promise<LiquorCustomerFile> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/files`,
    { method: 'POST', token, body },
  )
  return mapLiquorCustomerFile(res.data ?? {})
}

export async function getLiquorCustomerFileDownloadUrl(
  token: string,
  customerId: number,
  linkId: number,
): Promise<{ downloadUrl: string; fileName: string; mimeType: string }> {
  const res = await apiRequest<{
    ok?: boolean
    data?: { downloadUrl?: string; fileName?: string; mimeType?: string }
  }>(`/api/liquor/customers/${customerId}/files/${linkId}/download`, { method: 'GET', token })
  return {
    downloadUrl: String(res.data?.downloadUrl ?? ''),
    fileName: String(res.data?.fileName ?? 'download'),
    mimeType: String(res.data?.mimeType ?? ''),
  }
}

export async function deleteLiquorCustomerFile(token: string, customerId: number, linkId: number): Promise<void> {
  await apiRequest(`/api/liquor/customers/${customerId}/files/${linkId}`, { method: 'DELETE', token })
}

export async function uploadLiquorCustomerFile(
  token: string,
  customerId: number,
  file: File,
  meta: LiquorCustomerFileUploadInput,
  onProgress?: (message: string) => void,
): Promise<LiquorCustomerFile> {
  onProgress?.('업로드 준비 중…')
  const presign = await presignLiquorCustomerFile(token, customerId, {
    fileName: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  })

  onProgress?.('파일 전송 중…')
  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(presign.putHeaders ?? {}),
    },
    body: file,
  })
  if (!putRes.ok) {
    throw new Error('파일 업로드에 실패했습니다.')
  }

  onProgress?.('등록 중…')
  const linkBody: Parameters<typeof confirmLiquorCustomerFile>[2] = {
    fileId: presign.fileId,
    objectKey: presign.objectKey,
    fileName: file.name,
    size: file.size,
    mimeType: file.type || 'application/octet-stream',
    documentKind: meta.documentKind,
    title: meta.title,
    memo: meta.memo,
    linkTarget: meta.linkTarget ?? 'customer',
  }
  if (meta.linkTarget === 'support_contract') {
    linkBody.targetId = meta.targetId ?? meta.supportContractId ?? null
  } else if (meta.linkTarget === 'repayment') {
    linkBody.targetId = meta.targetId ?? meta.repaymentId ?? null
  } else if (meta.linkTarget === 'support_item') {
    linkBody.targetId = meta.targetId ?? meta.supportItemId ?? null
  }

  return confirmLiquorCustomerFile(token, customerId, linkBody)
}
