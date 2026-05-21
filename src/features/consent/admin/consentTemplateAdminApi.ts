import { ApiError, resolveApiUrl } from '../../../lib/apiClient'

export interface ConsentTemplateListRow {
  id: string
  ga_id: number
  insurance_company_id: string
  fax_number: string
  pdf_storage_key: string
  fields: unknown
  created_at: string
  updated_at: string
}

export interface ConsentTemplateDetail extends ConsentTemplateListRow {
  fields: unknown
}

export async function listAdminConsentTemplates(token: string): Promise<ConsentTemplateListRow[]> {
  const url = resolveApiUrl('/api/admin/consent-templates')
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data && typeof data === 'object' && 'message' in data ? String(data.message) : undefined
    throw new ApiError(msg ?? '목록을 불러오지 못했습니다.', res.status)
  }
  if (!Array.isArray(data)) {
    throw new ApiError('목록 형식이 올바르지 않습니다.', res.status)
  }
  return data as ConsentTemplateListRow[]
}

export async function getAdminConsentTemplate(
  token: string,
  id: string,
): Promise<ConsentTemplateDetail> {
  const url = resolveApiUrl(`/api/admin/consent-template/${encodeURIComponent(id)}`)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  const data = (await res.json().catch(() => ({}))) as { message?: string }
  if (!res.ok) {
    throw new ApiError(data.message ?? '템플릿을 불러오지 못했습니다.', res.status)
  }
  return data as ConsentTemplateDetail
}

export async function fetchAdminConsentTemplatePdf(token: string, id: string): Promise<ArrayBuffer> {
  const url = resolveApiUrl(`/api/admin/consent-template/${encodeURIComponent(id)}/pdf`)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token.trim()}` },
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string }
    throw new ApiError(data.message ?? 'PDF를 불러오지 못했습니다.', res.status)
  }
  return res.arrayBuffer()
}

export async function saveAdminConsentTemplate(
  token: string,
  formData: FormData,
): Promise<{ message?: string; template?: { id: string } }> {
  const url = resolveApiUrl('/api/admin/consent-template')
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.trim()}` },
    body: formData,
  })
  const data = (await res.json().catch(() => ({}))) as { message?: string; template?: { id: string } }
  if (!res.ok) {
    throw new ApiError(data.message ?? '저장에 실패했습니다.', res.status)
  }
  return data
}
