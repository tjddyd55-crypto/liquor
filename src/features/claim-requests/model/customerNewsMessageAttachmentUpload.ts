import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import { validateInsurerNewsFile } from '../../insurer-news/utils/validateInsurerNewsFile'

export type CustomerNewsMessageAttachmentDraft = {
  localId: string
  file: File
  kind: 'image' | 'file'
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  errorMessage?: string
  cdnUrl?: string
  objectKey?: string
  mimeType?: string
  sizeBytes?: number
}

export function validateCustomerNewsMessageFile(file: File): string | null {
  const validated = validateInsurerNewsFile(file)
  return validated.ok ? null : validated.message
}

export function createCustomerNewsMessageAttachmentDraft(file: File): CustomerNewsMessageAttachmentDraft {
  const validated = validateInsurerNewsFile(file)
  const kind = validated.ok ? validated.kind : 'file'
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    kind,
    status: 'pending',
  }
}

/**
 * 설계사 고객메시지/개인메시지 첨부 — `/api/agent/customer-news/attachments/*` (일반 로그인 권한).
 */
export async function uploadCustomerNewsMessageAttachment(
  token: string,
  item: CustomerNewsMessageAttachmentDraft,
): Promise<CustomerNewsMessageAttachmentDraft> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const validated = validateInsurerNewsFile(item.file)
  if (!validated.ok) {
    return { ...item, status: 'failed', errorMessage: validated.message }
  }
  const contentType = item.file.type || (validated.kind === 'file' ? 'application/pdf' : 'image/jpeg')
  const presign = await apiRequest<{
    uploadUrl: string
    objectKey: string
    fileUrl: string
    putHeaders?: Record<string, string>
    kind: 'image' | 'file'
  }>('/api/agent/customer-news/attachments/presign', {
    method: 'POST',
    token,
    body: JSON.stringify({
      fileName: item.file.name || 'file',
      contentType,
      sizeBytes: item.file.size,
    }),
  })

  const putHeaders: Record<string, string> = {
    'Content-Type': contentType,
    ...(presign.putHeaders ?? {}),
  }

  let putOk = false
  try {
    const put = await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: putHeaders,
      body: item.file,
    })
    putOk = put.ok
  } catch {
    putOk = false
  }

  if (!putOk) {
    const q = new URLSearchParams({
      objectKey: presign.objectKey,
      contentType,
      fileSize: String(item.file.size),
    })
    const proxyResp = await fetch(
      resolveApiUrl(`/api/agent/customer-news/attachments/upload-proxy?${q.toString()}`),
      {
        method: 'PUT',
        headers: {
          'Content-Type': contentType,
          Authorization: `Bearer ${token.trim()}`,
          'X-File-Size': String(item.file.size),
        },
        body: item.file,
      },
    )
    if (!proxyResp.ok) {
      return {
        ...item,
        status: 'failed',
        errorMessage: '첨부파일 업로드에 실패했습니다. 파일을 다시 선택해 주세요.',
      }
    }
  }

  return {
    ...item,
    status: 'completed',
    kind: presign.kind ?? validated.kind,
    cdnUrl: presign.fileUrl,
    objectKey: presign.objectKey,
    mimeType: contentType,
    sizeBytes: item.file.size,
  }
}

export async function uploadCustomerNewsMessageAttachments(
  token: string,
  drafts: CustomerNewsMessageAttachmentDraft[],
): Promise<CustomerNewsMessageAttachmentDraft[]> {
  const out: CustomerNewsMessageAttachmentDraft[] = []
  for (const item of drafts) {
    if (item.status === 'failed') {
      out.push(item)
      continue
    }
    if (item.status === 'completed' && item.cdnUrl && item.objectKey) {
      out.push(item)
      continue
    }
    out.push({ ...item, status: 'uploading' })
    const uploaded = await uploadCustomerNewsMessageAttachment(token, item)
    out.push(uploaded)
  }
  return out
}
