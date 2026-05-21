/**
 * 브라우저 새 탭/iframe 에 Authorization 헤더를 붙일 수 없으므로,
 * 짧은 수명 토큰으로 인라인 PDF URL 을 열 수 있게 한다.
 */

import crypto from 'node:crypto'

const STORAGE_OPEN_TTL_MS = 10 * 60 * 1000
const PDF_PREVIEW_TTL_MS = 10 * 60 * 1000
/** 렌더 미리보기 1건 상한 (바이트) — 템플릿 업로드 한도와 맞춤 */
export const MAX_PDF_PREVIEW_BYTES = 25 * 1024 * 1024

/** @type {Map<string, { userId: string, gaId: number, fileId: number, pathSegment: string, customerId: number | null, disposition: 'inline' | 'attachment', expiresAt: number }>} */
const storageOpens = new Map()

/** @type {Map<string, { buffer: Buffer, pathSegment: string, expiresAt: number, userId: string | null }>} */
const pdfPreviews = new Map()

function randomToken() {
  return crypto.randomBytes(32).toString('hex')
}

function purgeMap(map) {
  const now = Date.now()
  for (const [k, v] of map) {
    if (v.expiresAt <= now) {
      map.delete(k)
    }
  }
}

function startJanitor() {
  const t = setInterval(() => {
    purgeMap(storageOpens)
    purgeMap(pdfPreviews)
  }, 60_000)
  if (typeof t.unref === 'function') {
    t.unref()
  }
}

startJanitor()

/**
 * @param {{ userId: string, gaId: number, fileId: number, pathSegment: string, customerId?: number | null, disposition?: 'inline' | 'attachment' }} meta
 */
export function issueStorageOpenToken(meta) {
  purgeMap(storageOpens)
  const token = randomToken()
  const disposition = meta.disposition === 'attachment' ? 'attachment' : 'inline'
  storageOpens.set(token, {
    userId: meta.userId,
    gaId: meta.gaId,
    fileId: meta.fileId,
    pathSegment: meta.pathSegment,
    customerId: meta.customerId != null ? Number(meta.customerId) : null,
    disposition,
    expiresAt: Date.now() + STORAGE_OPEN_TTL_MS,
  })
  return token
}

/**
 * @param {string} token
 */
export function getStorageOpenMeta(token) {
  purgeMap(storageOpens)
  const k = String(token ?? '').trim()
  if (!k) return null
  const v = storageOpens.get(k)
  if (!v || v.expiresAt <= Date.now()) {
    if (v) storageOpens.delete(k)
    return null
  }
  return v
}

/**
 * @param {Buffer | Uint8Array} buffer
 * @param {{ pathSegment: string, userId?: string | null }} meta
 * @returns {string} token
 */
export function issuePdfPreviewPdf(buffer, meta) {
  purgeMap(pdfPreviews)
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  if (buf.length > MAX_PDF_PREVIEW_BYTES) {
    const err = new Error('PDF 미리보기 크기 초과')
    err.httpStatus = 400
    throw err
  }
  const token = randomToken()
  pdfPreviews.set(token, {
    buffer: buf,
    pathSegment: meta.pathSegment,
    userId: meta.userId != null ? String(meta.userId) : null,
    expiresAt: Date.now() + PDF_PREVIEW_TTL_MS,
  })
  return token
}

/**
 * @param {string} token
 */
export function getPdfPreviewEntry(token) {
  purgeMap(pdfPreviews)
  const k = String(token ?? '').trim()
  if (!k) return null
  const v = pdfPreviews.get(k)
  if (!v || v.expiresAt <= Date.now()) {
    if (v) pdfPreviews.delete(k)
    return null
  }
  return v
}

/**
 * 단일 URL path 세그먼트용 파일명(표시명 기반).
 * @param {string} raw
 * @param {string} fallbackBase
 * @param {string} [defaultExt]
 */
export function toSinglePathFilename(raw, fallbackBase, defaultExt = '.pdf') {
  let base = String(raw ?? '').trim() || String(fallbackBase ?? '').trim() || 'document'
  base = base.replace(/[\r\n\u0000]/g, '').replace(/[/\\<>?*|"]/g, '_').replace(/\s+/g, '_')
  base = base.replace(/_+/g, '_').replace(/^_+|_+$/g, '')
  if (!base.length) base = 'document'
  const ext = defaultExt.startsWith('.') ? defaultExt : `.${defaultExt}`
  if (!/\.[a-z0-9]{1,8}$/i.test(base)) {
    base = `${base}${ext}`
  }
  return base.slice(0, 200)
}
