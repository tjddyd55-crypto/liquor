/**
 * PDF 자동화 엔진 — HTTP 클라이언트.
 *
 * 역할: URL/메서드/FormData 조립만. 어플리케이션 로직(상태·캐시·메시지)은 호출측이 담당.
 * 이렇게 분리해야 관리자·사용자 UI 가 동일 API 를 다르게 감쌀 수 있다.
 */

import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import { logger } from '../../../lib/logger'
import type {
  PdfFieldSpec,
  PdfTemplateDetail,
  PdfTemplateSummary,
} from '../types'

/** `%PDF` 시그니처 탐색 상한 — 선두 BOM·일부 프록시 프리픽스 뒤에 오는 경우까지 허용 */
const PDF_SIGNATURE_SCAN_MAX_BYTES = 4096

/**
 * 본문 어딘가(상한 내)에 PDF 시그니처 `%PDF` 가 있는지.
 * UTF-8 BOM(EF BB BF) 은 건너뛴 뒤 검사한다.
 */
function findPdfSignatureOffset(buf: ArrayBuffer): number {
  if (buf.byteLength < 4) return -1
  const u8 = new Uint8Array(buf)
  let i = 0
  if (
    buf.byteLength >= 3 &&
    u8[0] === 0xef &&
    u8[1] === 0xbb &&
    u8[2] === 0xbf
  ) {
    i = 3
  }
  const limit = Math.min(buf.byteLength, PDF_SIGNATURE_SCAN_MAX_BYTES)
  for (; i <= limit - 4; i++) {
    if (
      u8[i] === 0x25 &&
      u8[i + 1] === 0x50 &&
      u8[i + 2] === 0x44 &&
      u8[i + 3] === 0x46
    ) {
      return i
    }
  }
  return -1
}

/**
 * HTML/JSON 에러 본문처럼 보이면 true — 이 경우는 PDF 가 아니라 서버/프록시 오류로 본다.
 */
function bodyLooksLikeTextProtocolResponse(buf: ArrayBuffer): boolean {
  const sliceLen = Math.min(buf.byteLength, 512)
  const u8 = new Uint8Array(buf, 0, sliceLen)
  let i = 0
  if (
    sliceLen >= 3 &&
    u8[0] === 0xef &&
    u8[1] === 0xbb &&
    u8[2] === 0xbf
  ) {
    i = 3
  }
  while (i < sliceLen && (u8[i] === 9 || u8[i] === 10 || u8[i] === 13 || u8[i] === 32)) {
    i += 1
  }
  if (i >= sliceLen) return false
  const b = u8[i]
  return b === 0x3c || b === 0x7b || b === 0x5b
}

function contentTypeSuggestsPdfBytes(ct: string): boolean {
  const l = ct.toLowerCase()
  return (
    l.includes('application/pdf') ||
    l.includes('application/octet-stream') ||
    l.includes('binary/octet-stream') ||
    l.includes('application/x-pdf')
  )
}

/**
 * 실패 응답을 해석해 ApiError 로 변환한다.
 * JSON body 가 있으면 message/code 를 꺼내고, 없으면 HTTP status 로 대체한다.
 * 이 헬퍼가 있어야 바이너리 엔드포인트(/file, /render) 의 에러도
 * 일관된 형태로 UI/로거에 전달된다.
 */
async function toApiError(
  res: Response,
  fallback: string,
  event: string,
  extra: Record<string, unknown> = {},
): Promise<ApiError> {
  const text = await res.text().catch(() => '')
  let body: { message?: string; code?: string } = {}
  if (text) {
    try {
      body = JSON.parse(text) as typeof body
    } catch {
      /* JSON 아니면 텍스트 그대로 메시지 자리에. */
      body = { message: text.slice(0, 200) }
    }
  }
  logger.error(event, {
    ...extra,
    status: res.status,
    statusText: res.statusText,
    serverMessage: body.message ?? null,
    serverCode: body.code ?? null,
  })
  return new ApiError(body.message ?? fallback, res.status)
}

function authHeader(token: string | null | undefined): Record<string, string> {
  return token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}
}

// ─── 관리자 전용 ────────────────────────────────────────────────────

export async function uploadAdminPdfTemplateFile(
  token: string,
  input: { gaId: number | null; file: File },
): Promise<{ storageKey: string; pageCount: number }> {
  const fd = new FormData()
  fd.append('pdf', input.file)
  if (input.gaId != null) fd.append('gaId', String(input.gaId))

  let res: Response
  try {
    res = await fetch(resolveApiUrl('/api/admin/pdf-templates/upload'), {
      method: 'POST',
      headers: { ...authHeader(token) },
      body: fd,
    })
  } catch (networkError) {
    logger.error('pdf-template.upload.network-failed', {
      gaId: input.gaId,
      fileSize: input.file.size,
      error: networkError,
    })
    throw new ApiError('네트워크 오류로 업로드하지 못했습니다.', 0)
  }

  const payload = (await res.json().catch(() => ({}))) as {
    storageKey?: string
    pageCount?: number
    message?: string
  }
  if (!res.ok || !payload.storageKey) {
    logger.error('pdf-template.upload.server-rejected', {
      status: res.status,
      serverMessage: payload.message ?? null,
      gaId: input.gaId,
    })
    throw new ApiError(payload.message ?? 'PDF 업로드 실패', res.status)
  }
  return { storageKey: payload.storageKey, pageCount: Number(payload.pageCount) || 1 }
}

export function createAdminPdfTemplate(
  token: string,
  body: {
    gaId: number | null
    title: string
    description: string
    storageKey: string
    pageCount: number
  },
): Promise<{ template: PdfTemplateSummary }> {
  return apiRequest('/api/admin/pdf-templates', {
    method: 'POST',
    body: JSON.stringify(body),
    token,
  })
}

export function listAdminPdfTemplates(
  token: string,
): Promise<{ templates: PdfTemplateSummary[] }> {
  return apiRequest('/api/admin/pdf-templates', { method: 'GET', token })
}

export function getAdminPdfTemplate(
  token: string,
  id: number,
): Promise<PdfTemplateDetail> {
  return apiRequest(`/api/admin/pdf-templates/${id}`, { method: 'GET', token })
}

export function patchAdminPdfTemplate(
  token: string,
  id: number,
  patch: { title?: string; description?: string; isActive?: boolean },
): Promise<{ template: PdfTemplateSummary | null }> {
  return apiRequest(`/api/admin/pdf-templates/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
    token,
  })
}

export function saveAdminPdfTemplateFields(
  token: string,
  id: number,
  fields: PdfFieldSpec[],
): Promise<{ fields: (PdfFieldSpec & { id: number })[] }> {
  return apiRequest(`/api/admin/pdf-templates/${id}/fields`, {
    method: 'PUT',
    body: JSON.stringify({ fields }),
    token,
  })
}

/**
 * 사용자 권한으로 템플릿 원본 PDF 를 바이너리로 받는다(신청 미리보기 오버레이용).
 */
export async function fetchPdfTemplateFile(token: string, id: number): Promise<ArrayBuffer> {
  const url = resolveApiUrl(`/api/pdf-templates/${id}/file`)
  return fetchAuthorizedPdfTemplateBuffer(token, url, id, 'user')
}

export async function fetchAdminPdfTemplateFile(
  token: string,
  id: number,
): Promise<ArrayBuffer> {
  const url = resolveApiUrl(`/api/admin/pdf-templates/${id}/file`)
  return fetchAuthorizedPdfTemplateBuffer(token, url, id, 'admin')
}

async function fetchAuthorizedPdfTemplateBuffer(
  token: string,
  url: string,
  templateId: number,
  kind: 'admin' | 'user',
): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...authHeader(token) },
    })
  } catch (networkError) {
    logger.error('pdf-template.file.network-failed', {
      templateId,
      kind,
      url,
      error: networkError,
    })
    throw new ApiError('네트워크 오류로 원본 PDF 를 불러오지 못했습니다.', 0)
  }

  if (!res.ok) {
    throw await toApiError(res, '원본 PDF 를 불러오지 못했습니다.', 'pdf-template.file.http-error', {
      templateId,
      kind,
    })
  }

  const contentType = res.headers.get('content-type') ?? ''
  const contentLengthHeader = res.headers.get('content-length')
  const contentTypeLower = contentType.toLowerCase()
  /*
   * HTML/JSON 이 200 으로 온 경우 pdfjs 가 parse-failed 로만 드러나 사용자 혼란을 키운다.
   * 본문을 읽기 전에 Content-Type 으로 차단한다.
   */
  if (contentTypeLower.includes('text/html') || contentTypeLower.includes('application/json')) {
    logger.error('pdf-template.file.non-pdf-content-type', {
      templateId,
      kind,
      contentType,
      status: res.status,
    })
    throw new ApiError(
      'PDF 파일 대신 다른 응답을 받았습니다. 파일 경로 또는 접근 권한을 확인해주세요.',
      res.status,
    )
  }

  const buffer = await res.arrayBuffer()
  const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : null

  /*
   * 0 바이트 응답은 "형식을 해석할 수 없다(parse-failed)" 로 오해되어 pdfjs 까지 흘러간다.
   * 여기서 명시적 에러로 차단해 UX 메시지와 원인 진단을 모두 정확하게 만든다.
   *
   * 함께 로깅하는 3 요소 — 헤더 content-length / 수신 byteLength / content-type — 이
   * 서로 다르면 중간 경로(Railway edge / 프록시 / Electron 네트워크 스택) 가 범인임이
   * 드러난다. 같다면 서버가 정말 0 바이트를 보낸 것이므로 서버 측 로그와 대조하면 된다.
   */
  if (buffer.byteLength === 0) {
    logger.error('pdf-template.file.empty-body', {
      templateId,
      kind,
      status: res.status,
      contentType,
      declaredLength,
      receivedByteLength: 0,
    })
    throw new ApiError(
      'PDF 파일 데이터를 불러오지 못했습니다. 파일 저장 상태를 확인해주세요.',
      res.status,
    )
  }

  const pdfSigAt = findPdfSignatureOffset(buffer)
  const hasPdfSignature = pdfSigAt >= 0
  if (!hasPdfSignature) {
    if (bodyLooksLikeTextProtocolResponse(buffer)) {
      logger.error('pdf-template.file.body-looks-like-text-not-pdf', {
        templateId,
        kind,
        byteLength: buffer.byteLength,
        contentType,
      })
      throw new ApiError(
        'PDF 파일 대신 다른 응답(HTML/JSON)을 받았습니다. 서버 응답과 파일 경로를 확인해주세요.',
        res.status,
      )
    }
    if (contentTypeSuggestsPdfBytes(contentTypeLower)) {
      logger.warn('pdf-template.file.no-pdf-signature-trusting-binary-content-type', {
        templateId,
        kind,
        byteLength: buffer.byteLength,
        contentType,
      })
    } else {
      logger.warn('pdf-template.file.no-pdf-signature-defer-to-pdfjs', {
        templateId,
        kind,
        byteLength: buffer.byteLength,
        contentType,
      })
    }
    /*
     * 시그니처만으로 거부하지 않는다 — CMap/오프셋 PDF·octet-stream 정상 응답은
     * PDF.js 파싱 실패 시에만 `PdfOverlayCanvas` 가 치명 오류를 올린다.
     */
  }

  /*
   * 정상 케이스도 info 로 한 줄 남긴다 — 문제 발생 시 "직전 성공" 과 비교하기 위한 기준선.
   * 프로덕션 debug 는 조용히 버려지므로 용량 부담은 없다.
   */
  logger.debug('pdf-template.file.loaded', {
    templateId,
    kind,
    status: res.status,
    contentType,
    declaredLength,
    receivedByteLength: buffer.byteLength,
  })
  return buffer
}

export function deleteAdminPdfTemplate(token: string, id: number): Promise<void> {
  return apiRequest(`/api/admin/pdf-templates/${id}`, {
    method: 'DELETE',
    token,
  })
}

// ─── 사용자 ───────────────────────────────────────────────────────────

export function listPdfTemplates(token: string): Promise<{ templates: PdfTemplateSummary[] }> {
  return apiRequest('/api/pdf-templates', { method: 'GET', token })
}

export function getPdfTemplate(token: string, id: number): Promise<PdfTemplateDetail> {
  return apiRequest(`/api/pdf-templates/${id}`, { method: 'GET', token })
}

// ─── 발급 이력(사용자/관리자 공용) ───────────────────────────────────

export interface PdfIssuanceSummary {
  id: number
  templateId: number | null
  userId: string | null
  gaId: number | null
  templateCode: string
  templateTitle: string
  byteLength: number
  createdAt: string
}

/** 단건 조회(JSON) — `values_snapshot` 기반 「내용 불러오기」용. 접근 규칙은 `/file` 과 동일. */
export interface PdfIssuanceDetail {
  id: number
  templateId: number | null
  templateCode: string
  templateTitle: string
  gaId: number | null
  userId: string | null
  createdAt: string
  valuesSnapshot: Record<string, string>
}

export function listPdfIssuances(
  token: string,
): Promise<{ issuances: PdfIssuanceSummary[] }> {
  return apiRequest('/api/pdf-issuances', { method: 'GET', token })
}

export function getPdfIssuance(
  token: string,
  id: number,
): Promise<{ issuance: PdfIssuanceDetail }> {
  return apiRequest(`/api/pdf-issuances/${id}`, { method: 'GET', token })
}

/**
 * 보관된 PDF 를 바이너리로 받는다.
 * 서버 측에서 본인 여부/관리자 여부를 검사하므로 프론트는 요청만 한다.
 */
export async function fetchPdfIssuanceFile(token: string, id: number): Promise<Blob> {
  const url = resolveApiUrl(`/api/pdf-issuances/${id}/file`)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { ...authHeader(token) },
    })
  } catch (networkError) {
    logger.error('pdf-issuance.file.network-failed', {
      issuanceId: id,
      error: networkError,
    })
    throw new ApiError('네트워크 오류로 보관된 PDF 를 불러오지 못했습니다.', 0)
  }

  if (!res.ok) {
    throw await toApiError(res, '보관된 PDF 를 불러오지 못했습니다.', 'pdf-issuance.file.http-error', {
      issuanceId: id,
    })
  }
  return res.blob()
}

/**
 * 미리보기용: PDF 바이트를 서버에 토큰으로 두고, iframe/window.open 에 붙일 GET URL 을 반환한다.
 * (blob iframe 은 내장 뷰어 다운로드명이 UUID 로 남는다)
 */
export function requestPdfRenderPreviewUrl(
  token: string,
  id: number,
  values: Record<string, string>,
  options?: {
    fontSizes?: Record<string, number>
    displayFilename?: string
    customerId?: number
    overwriteCustomerMapping?: boolean
  },
): Promise<{ previewUrl: string; downloadFilename: string }> {
  const payload: {
    values: Record<string, string>
    fontSizes?: Record<string, number>
    displayFilename?: string
    customerId?: number
    overwriteCustomerMapping?: boolean
  } = { values }
  const fs = options?.fontSizes
  if (fs && typeof fs === 'object' && Object.keys(fs).length > 0) {
    payload.fontSizes = fs
  }
  const df = options?.displayFilename?.trim()
  if (df) {
    payload.displayFilename = df
  }
  if (options?.customerId != null && Number.isInteger(options.customerId) && options.customerId >= 1) {
    payload.customerId = options.customerId
  }
  if (options?.overwriteCustomerMapping === true) {
    payload.overwriteCustomerMapping = true
  }
  return apiRequest(`/api/pdf-templates/${id}/render-preview`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

/**
 * 입력값을 전송하고 스탬핑된 PDF 바이너리를 받는다.
 * 브라우저에서 다운로드 트리거는 호출측에서 Blob + anchor 로 처리.
 */
export async function renderPdfTemplate(
  token: string,
  id: number,
  values: Record<string, string>,
  options?: {
    preview?: boolean
    fontSizes?: Record<string, number>
    customerId?: number
    overwriteCustomerMapping?: boolean
  },
): Promise<Blob> {
  const query = options?.preview ? '?preview=1' : ''
  const url = resolveApiUrl(`/api/pdf-templates/${id}/render${query}`)
  const payload: {
    values: Record<string, string>
    fontSizes?: Record<string, number>
    customerId?: number
    overwriteCustomerMapping?: boolean
  } = {
    values,
  }
  const fs = options?.fontSizes
  if (fs && typeof fs === 'object' && Object.keys(fs).length > 0) {
    payload.fontSizes = fs
  }
  if (options?.customerId != null && Number.isInteger(options.customerId) && options.customerId >= 1) {
    payload.customerId = options.customerId
  }
  if (options?.overwriteCustomerMapping === true) {
    payload.overwriteCustomerMapping = true
  }
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader(token) },
      body: JSON.stringify(payload),
    })
  } catch (networkError) {
    logger.error('pdf-template.render.network-failed', {
      templateId: id,
      valueKeys: Object.keys(values),
      error: networkError,
    })
    throw new ApiError('네트워크 오류로 PDF 를 생성하지 못했습니다.', 0)
  }

  if (!res.ok) {
    throw await toApiError(res, 'PDF 생성 실패', 'pdf-template.render.http-error', {
      templateId: id,
      valueKeys: Object.keys(values),
    })
  }
  return res.blob()
}
