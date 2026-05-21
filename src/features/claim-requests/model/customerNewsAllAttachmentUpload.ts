import {
  markStorageUploadFailed,
  presignStorageFile,
  saveStorageFile,
} from '../../storage/api/storageApi'

export type AllNewsAttachmentDraft = {
  localId: string
  file: File
  kind: 'image' | 'file'
  previewUrl: string | null
  status: 'pending' | 'uploading' | 'completed' | 'failed'
  errorMessage?: string
  cdnUrl?: string
  objectKey?: string
  mimeType?: string
  sizeBytes?: number
  storageFileId?: number
}

/** 전체 고객 소식(customer-news/all) 업로드: 이미지 전용 (jpeg/png/webp/gif) */
export const ALLOWED_CUSTOMER_NEWS_ALL_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

export const MAX_CUSTOMER_NEWS_ALL_ATTACHMENT_BYTES = 10 * 1024 * 1024

export function validateCustomerNewsAllImage(file: File): string | null {
  const mimeType = file.type || 'application/octet-stream'
  if (!ALLOWED_CUSTOMER_NEWS_ALL_MIME_TYPES.has(mimeType)) {
    return 'JPG, PNG, WEBP, GIF 이미지만 첨부할 수 있습니다.'
  }
  if (file.size < 1) {
    return '빈 파일은 첨부할 수 없습니다.'
  }
  if (file.size > MAX_CUSTOMER_NEWS_ALL_ATTACHMENT_BYTES) {
    return '첨부파일은 10MB 이하만 업로드할 수 있습니다.'
  }
  return null
}

export function createLocalCustomerNewsImageAttachment(file: File): AllNewsAttachmentDraft {
  const mimeType = file.type || 'application/octet-stream'
  const previewUrl = URL.createObjectURL(file)
  return {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    file,
    kind: 'image',
    previewUrl,
    status: 'pending',
  }
}

/** 서버에 이미 저장된 이미지(재업로드 없이 PATCH 페이로드에 실을 때) */
export function createRemoteCustomerNewsImageAttachment(input: {
  serverKey: string
  url: string
  objectKey?: string | null
  fileName: string
  mimeType?: string | null
  size?: number | null
}): AllNewsAttachmentDraft {
  const fileName = input.fileName.trim() || 'image.jpg'
  const mimeType = (input.mimeType && input.mimeType.trim()) || 'image/jpeg'
  const placeholderFile = new File([], fileName, { type: mimeType })
  return {
    localId: `remote-${input.serverKey}`,
    file: placeholderFile,
    kind: 'image',
    previewUrl: null,
    status: 'completed',
    cdnUrl: input.url.trim(),
    objectKey: input.objectKey?.trim() || undefined,
    mimeType,
    sizeBytes: input.size ?? undefined,
  }
}

/** presignStorageFile → PUT → saveStorageFile (content=customer-news/all, customerId=null) */
export async function uploadCustomerNewsAllAttachment(
  token: string,
  item: AllNewsAttachmentDraft,
): Promise<AllNewsAttachmentDraft> {
  const mimeType = item.file.type || 'image/jpeg'
  const presign = await presignStorageFile(token, {
    fileName: item.file.name || 'customer-news-all',
    contentType: mimeType,
    sizeBytes: item.file.size,
    customerId: null,
  })

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      ...(presign.putHeaders ?? {}),
    },
    body: item.file,
  })
  if (!put.ok) {
    await markStorageUploadFailed(token, presign.fileId).catch(() => {})
    throw new Error(`첨부파일 업로드에 실패했습니다. (${put.status})`)
  }

  const saved = await saveStorageFile(token, {
    fileId: presign.fileId,
    fileName: item.file.name || presign.displayName,
    displayName: item.file.name || presign.displayName,
    objectKey: presign.objectKey,
    fileUrl: presign.fileUrl,
    size: item.file.size,
    mimeType,
    content: 'customer-news/all',
    folderId: null,
    customerId: null,
  })

  return {
    ...item,
    status: 'completed',
    objectKey: saved.objectKey ?? presign.objectKey,
    cdnUrl: saved.fileUrl || presign.fileUrl,
    mimeType: saved.mimeType ?? mimeType,
    sizeBytes: saved.fileSize ?? item.file.size,
    storageFileId: saved.id,
  }
}
