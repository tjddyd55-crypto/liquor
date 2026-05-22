/**
 * 주류회사 CRM PDF 템플릿 API 클라이언트 (liquor_pdf_templates 전용).
 */
import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import type { PdfFieldSpec, PdfTemplateDetail, PdfTemplateSummary } from '../../pdf-engine/types'

const BASE = '/api/liquor/signature-templates/pdf'

function authHeader(token: string) {
  return token?.trim() ? { Authorization: `Bearer ${token.trim()}` } : {}
}

export async function uploadLiquorPdfTemplateFile(
  token: string,
  input: { gaId: number | null; file: File },
): Promise<{ storageKey: string; pageCount: number }> {
  const fd = new FormData()
  fd.append('pdf', input.file)
  if (input.gaId != null) fd.append('gaId', String(input.gaId))

  const res = await fetch(resolveApiUrl(`${BASE}/upload`), {
    method: 'POST',
    headers: { ...authHeader(token) },
    body: fd,
  })
  const payload = (await res.json().catch(() => ({}))) as {
    storageKey?: string
    pageCount?: number
    message?: string
  }
  if (!res.ok || !payload.storageKey) {
    throw new ApiError(payload.message ?? 'PDF 업로드 실패', res.status)
  }
  return { storageKey: payload.storageKey, pageCount: Number(payload.pageCount) || 1 }
}

export async function createLiquorPdfTemplate(
  token: string,
  body: {
    gaId: number | null
    title: string
    storageKey: string
    pageCount: number
    description?: string
  },
): Promise<PdfTemplateSummary> {
  const res = await apiRequest<{ template?: PdfTemplateSummary }>(BASE, {
    method: 'POST',
    token,
    body,
  })
  if (!res.template) throw new ApiError('템플릿 생성 응답이 올바르지 않습니다.', 500)
  return res.template
}

export async function listLiquorPdfTemplates(token: string): Promise<{ templates: PdfTemplateSummary[] }> {
  return apiRequest(`${BASE}`, { method: 'GET', token })
}

export async function getLiquorPdfTemplate(token: string, id: number): Promise<PdfTemplateDetail> {
  const res = await apiRequest<{ template: PdfTemplateSummary; fields: PdfFieldSpec[] }>(
    `${BASE}/${id}`,
    { method: 'GET', token },
  )
  return { ...res.template, fields: res.fields ?? [] }
}

export async function saveLiquorPdfTemplateFields(
  token: string,
  id: number,
  fields: PdfFieldSpec[],
): Promise<PdfFieldSpec[]> {
  const res = await apiRequest<{ fields: PdfFieldSpec[] }>(`${BASE}/${id}/fields`, {
    method: 'PUT',
    token,
    body: { fields },
  })
  return res.fields ?? []
}

export function liquorPdfTemplateFileUrl(token: string, id: number): string {
  return resolveApiUrl(`${BASE}/${id}/file?token=${encodeURIComponent(token)}`)
}
