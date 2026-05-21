import { randomUUID } from 'node:crypto'

export const CUSTOMER_NEWS_MESSAGE_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

export const CUSTOMER_NEWS_MESSAGE_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const CUSTOMER_NEWS_MESSAGE_MAX_PDF_BYTES = 10 * 1024 * 1024

/**
 * @param {string} contentType
 */
export function maxBytesForCustomerNewsMessageMime(contentType) {
  return contentType === 'application/pdf'
    ? CUSTOMER_NEWS_MESSAGE_MAX_PDF_BYTES
    : CUSTOMER_NEWS_MESSAGE_MAX_IMAGE_BYTES
}

/**
 * @param {string} contentType
 * @param {number} sizeBytes
 */
export function validateCustomerNewsMessageUpload(contentType, sizeBytes) {
  const mime = String(contentType ?? '').trim().split(';')[0].trim()
  if (!CUSTOMER_NEWS_MESSAGE_ALLOWED_MIME.has(mime)) {
    return { ok: false, message: 'JPG, PNG, WEBP, GIF 이미지 또는 PDF만 첨부할 수 있습니다.' }
  }
  const maxB = maxBytesForCustomerNewsMessageMime(mime)
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > maxB) {
    return { ok: false, message: '첨부파일은 10MB 이하만 업로드할 수 있습니다.' }
  }
  return { ok: true, mime }
}

/**
 * @param {string} gaPath
 * @param {string} agentId
 * @param {string} fileName
 */
export function buildCustomerNewsMessageObjectKey(gaPath, agentId, fileName) {
  const userSeg = String(agentId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128) || '_'
  const safeName =
    String(fileName ?? 'file')
      .trim()
      .replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_')
      .slice(0, 120) || 'file'
  return `insurer/${gaPath}/${userSeg}/customer-news-attachments/${Date.now()}-${randomUUID()}-${safeName}`
}

/**
 * @param {string} objectKey
 * @param {string} agentId
 * @param {string} gaPath
 */
export function assertCustomerNewsMessageObjectKey(objectKey, agentId, gaPath) {
  const key = String(objectKey ?? '').trim().replace(/^\//, '')
  if (!key) {
    return false
  }
  const userSeg = String(agentId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128) || '_'
  const prefix = `insurer/${gaPath}/${userSeg}/customer-news-attachments/`
  return key.startsWith(prefix)
}

/**
 * @param {unknown} raw
 * @returns {'image' | 'file'}
 */
export function customerNewsAttachmentKindFromMime(raw) {
  return String(raw ?? '').trim() === 'application/pdf' ? 'file' : 'image'
}
