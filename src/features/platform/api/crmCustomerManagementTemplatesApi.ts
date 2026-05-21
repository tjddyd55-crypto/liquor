import { ApiError, apiRequest } from '../../../lib/apiClient'
import { coercePositiveIntId } from '../../../lib/numericIds'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'

export interface CrmCustomerManagementTemplateApiRow extends Record<string, unknown> {
  id: number
  name: string
  industry_code: string
  description: string
  status: string
  revision: number
  updated_at?: string
  created_at?: string
}

export type CrmTemplateListRow = CrmCustomerManagementTemplateApiRow & {
  resolved: CustomerIndustryTemplate | null
}

type CrmTemplateMutationPayload = {
  row: CrmCustomerManagementTemplateApiRow
  resolved: CustomerIndustryTemplate
}

export type TenantCrmCustomerTemplatePatchResult = {
  id: number
  crmCustomerTemplateId: number | null
}

/** PATCH tenant crm-customer-template — safeApiResponse 가 data 만 반환하는 경우와 envelope 유지를 모두 처리 */
function unwrapTenantCrmCustomerTemplatePatchPayload(raw: unknown): TenantCrmCustomerTemplatePatchResult | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>

  const nested = o.data
  if (nested && typeof nested === 'object') {
    const parsed = parseTenantCrmTemplatePatchRow(nested as Record<string, unknown>)
    if (parsed) return parsed
  }

  return parseTenantCrmTemplatePatchRow(o)
}

function parseTenantCrmTemplatePatchRow(row: Record<string, unknown>): TenantCrmCustomerTemplatePatchResult | null {
  const id = coercePositiveIntId(row.id)
  if (id == null) return null
  const fkRaw = row.crm_customer_template_id ?? row.crmCustomerTemplateId
  let crmCustomerTemplateId: number | null = null
  if (fkRaw !== null && fkRaw !== undefined && String(fkRaw).trim() !== '') {
    const fk = coercePositiveIntId(fkRaw)
    if (fk == null) return null
    crmCustomerTemplateId = fk
  }
  return { id, crmCustomerTemplateId }
}

function extractApiErrorMessage(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as { message?: string }
  const msg = typeof o.message === 'string' ? o.message.trim() : ''
  return msg || fallback
}

/** apiRequest + safeApiResponse 가 `{ success, data }` 의 data 만 반환하는 경우와 row/resolved 직접 반환을 모두 처리 */
function unwrapCrmTemplateMutationPayload(raw: unknown): CrmTemplateMutationPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const nested = o.data
  if (nested && typeof nested === 'object') {
    const inner = nested as Record<string, unknown>
    if (inner.row != null && inner.resolved != null) {
      return inner as CrmTemplateMutationPayload
    }
  }
  if (o.row != null && o.resolved != null) {
    return o as CrmTemplateMutationPayload
  }
  return null
}

export async function listCrmCustomerManagementTemplates(
  token: string,
  industryCode?: string,
  opts?: { includeArchived?: boolean },
): Promise<CrmTemplateListRow[]> {
  const params = new URLSearchParams()
  if (industryCode?.trim()) {
    params.set('industry_code', industryCode.trim().toLowerCase())
  }
  if (opts?.includeArchived) {
    params.set('include_archived', '1')
  }
  const qs = params.toString() ? `?${params.toString()}` : ''
  const raw = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/admin/platform/crm-customer-management-templates${qs}`,
    { method: 'GET', token },
  )
  const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as { data?: unknown }).data : raw
  if (!Array.isArray(data)) {
    console.error('[listCrmCustomerManagementTemplates] invalid:', raw)
    throw new ApiError('템플릿 목록을 불러오지 못했습니다.', 500)
  }
  return (data as CrmTemplateListRow[]).map((row) => {
    const nid = coercePositiveIntId(row.id)
    return nid != null ? { ...row, id: nid } : row
  })
}

export async function fetchCrmCustomerManagementTemplate(token: string, id: number) {
  const raw = await apiRequest<{ success?: boolean; data?: unknown }>(
    `/api/admin/platform/crm-customer-management-templates/${id}`,
    { method: 'GET', token },
  )
  const data = unwrapCrmTemplateMutationPayload(raw)
  if (!data) {
    throw new ApiError('템플릿을 불러오지 못했습니다.', 500)
  }
  return data
}

export async function createCrmCustomerManagementTemplate(token: string, body: unknown) {
  const raw = await apiRequest<{ success?: boolean; data?: unknown; message?: string }>(
    `/api/admin/platform/crm-customer-management-templates`,
    { method: 'POST', token, body: JSON.stringify(body) },
  )
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('저장에 실패했습니다.', 500)
  }
  const o = raw as { message?: string }
  const data = unwrapCrmTemplateMutationPayload(raw)
  if (!data) {
    throw new ApiError(String(o.message ?? '저장에 실패했습니다.'), 400)
  }
  return data
}

export async function updateCrmCustomerManagementTemplate(token: string, id: number, body: unknown) {
  const raw = await apiRequest<{ success?: boolean; data?: unknown; message?: string }>(
    `/api/admin/platform/crm-customer-management-templates/${id}`,
    { method: 'PUT', token, body: JSON.stringify(body) },
  )
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('저장에 실패했습니다.', 500)
  }
  const o = raw as { message?: string }
  const data = unwrapCrmTemplateMutationPayload(raw)
  if (!data) {
    throw new ApiError(String(o.message ?? '저장에 실패했습니다.'), 400)
  }
  return data
}

export async function patchTenantCrmCustomerTemplate(
  token: string,
  tenantId: number,
  templateId: number | null,
): Promise<TenantCrmCustomerTemplatePatchResult> {
  const raw = await apiRequest<unknown>(
    `/api/admin/platform/tenants/${tenantId}/crm-customer-template`,
    {
      method: 'PATCH',
      token,
      body: JSON.stringify({ crm_customer_template_id: templateId }),
    },
  )
  const parsed = unwrapTenantCrmCustomerTemplatePatchPayload(raw)
  if (!parsed) {
    throw new ApiError(extractApiErrorMessage(raw, '테넌트 설정에 실패했습니다.'), 400)
  }
  return parsed
}

export async function listPlatformIndustriesSimple(token: string): Promise<{ id: number; code: string; name: string }[]> {
  const raw = await apiRequest<{ items?: unknown }>('/api/admin/platform/industries', {
    method: 'GET',
    token,
  })
  const data = raw?.items
  if (!Array.isArray(data)) {
    return []
  }
  return data
    .map((r) => {
      const o = r as Record<string, unknown>
      const id = typeof o.id === 'string' ? Number(o.id) : Number(o.id)
      return {
        id: Number.isFinite(id) ? id : 0,
        code: String(o.code ?? '').trim().toLowerCase(),
        name: String(o.name ?? '').trim(),
      }
    })
    .filter((x) => x.code.length > 0 && x.id > 0)
}
