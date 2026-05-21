import { ApiError, apiRequest } from '../../../lib/apiClient'

function tenantQs(tenantGaId: number | null, isSuper: boolean): string {
  if (!isSuper || tenantGaId == null || !Number.isFinite(tenantGaId)) {
    return ''
  }
  const q = new URLSearchParams()
  q.set('tenant_ga_id', String(tenantGaId))
  return `?${q.toString()}`
}

function tenantBody(tenantGaId: number | null, isSuper: boolean): Record<string, number> {
  if (!isSuper || tenantGaId == null || !Number.isFinite(tenantGaId)) {
    return {}
  }
  return { tenant_ga_id: tenantGaId }
}

export type ContractTemplateConfirmationFieldInputType = 'text' | 'textarea' | 'number' | 'date'
export type ContractTemplateConfirmationFieldInputRole = 'sender' | 'customer'

export type ContractTemplateConfirmationField = {
  id: string
  fieldKey: string
  label: string
  inputType: ContractTemplateConfirmationFieldInputType
  inputRole: ContractTemplateConfirmationFieldInputRole
  required: boolean
  sortOrder: number
  placeholder: string | null
  helpText: string | null
  createdAt: string
  updatedAt: string
}

export type CreateContractTemplateConfirmationFieldInput = {
  label: string
  fieldKey?: string
  inputType?: ContractTemplateConfirmationFieldInputType
  inputRole?: ContractTemplateConfirmationFieldInputRole
  required?: boolean
  sortOrder?: number
  placeholder?: string | null
  helpText?: string | null
}

export type UpdateContractTemplateConfirmationFieldInput = {
  label?: string
  inputType?: ContractTemplateConfirmationFieldInputType
  inputRole?: ContractTemplateConfirmationFieldInputRole
  required?: boolean
  sortOrder?: number
  placeholder?: string | null
  helpText?: string | null
}

function coerceInputType(raw: unknown): ContractTemplateConfirmationFieldInputType {
  const it = String(raw ?? 'text').trim()
  if (it === 'textarea' || it === 'number' || it === 'date' || it === 'text') {
    return it
  }
  return 'text'
}

function coerceInputRole(raw: unknown): ContractTemplateConfirmationFieldInputRole {
  const role = String(raw ?? 'sender').trim()
  if (role === 'customer' || role === 'sender') {
    return role
  }
  return 'sender'
}

function coerceField(raw: Record<string, unknown>): ContractTemplateConfirmationField {
  return {
    id: String(raw.id ?? ''),
    fieldKey: String(raw.fieldKey ?? raw.field_key ?? ''),
    label: String(raw.label ?? ''),
    inputType: coerceInputType(raw.inputType ?? raw.input_type),
    inputRole: coerceInputRole(raw.inputRole ?? raw.input_role),
    required: Boolean(raw.required),
    sortOrder: Number(raw.sortOrder ?? raw.sort_order ?? 0),
    placeholder: raw.placeholder != null ? String(raw.placeholder) : null,
    helpText:
      raw.helpText != null
        ? String(raw.helpText)
        : raw.help_text != null
          ? String(raw.help_text)
          : null,
    createdAt: String(raw.createdAt ?? raw.created_at ?? ''),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? ''),
  }
}

export async function listContractTemplateConfirmationFields(
  token: string,
  role: string | undefined,
  templateId: string,
  tenantGaId: number | null,
): Promise<ContractTemplateConfirmationField[]> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ fields?: unknown[] }>(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/confirmation-fields${qs}`,
    { method: 'GET', token },
  )
  const raw = body as { fields?: unknown[] }
  if (!raw?.fields || !Array.isArray(raw.fields)) {
    throw new ApiError('확인 항목 목록 응답 형식이 올바르지 않습니다.', 500)
  }
  return raw.fields.map((f) => coerceField(f as Record<string, unknown>))
}

export async function createContractTemplateConfirmationField(
  token: string,
  role: string | undefined,
  templateId: string,
  payload: CreateContractTemplateConfirmationFieldInput,
  tenantGaId: number | null,
): Promise<ContractTemplateConfirmationField> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ field?: unknown }>(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/confirmation-fields${qs}`,
    {
      method: 'POST',
      token,
      body: JSON.stringify({
        label: payload.label,
        fieldKey: payload.fieldKey,
        inputType: payload.inputType,
        inputRole: payload.inputRole,
        required: payload.required,
        sortOrder: payload.sortOrder,
        placeholder: payload.placeholder,
        helpText: payload.helpText,
        ...tenantBody(tenantGaId, isSuper),
      }),
    },
  )
  const fld = (body as { field?: unknown }).field
  if (!fld || typeof fld !== 'object') {
    throw new ApiError('확인 항목 생성 응답이 올바르지 않습니다.', 500)
  }
  return coerceField(fld as Record<string, unknown>)
}

export async function updateContractTemplateConfirmationField(
  token: string,
  role: string | undefined,
  templateId: string,
  fieldId: string,
  payload: UpdateContractTemplateConfirmationFieldInput,
  tenantGaId: number | null,
): Promise<ContractTemplateConfirmationField> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  const body = await apiRequest<{ field?: unknown }>(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/confirmation-fields/${encodeURIComponent(fieldId)}${qs}`,
    {
      method: 'PUT',
      token,
      body: JSON.stringify({
        ...payload,
        ...tenantBody(tenantGaId, isSuper),
      }),
    },
  )
  const fld = (body as { field?: unknown }).field
  if (!fld || typeof fld !== 'object') {
    throw new ApiError('확인 항목 수정 응답이 올바르지 않습니다.', 500)
  }
  return coerceField(fld as Record<string, unknown>)
}

export async function deleteContractTemplateConfirmationField(
  token: string,
  role: string | undefined,
  templateId: string,
  fieldId: string,
  tenantGaId: number | null,
): Promise<void> {
  const isSuper = role === 'SUPER_ADMIN'
  const qs = tenantQs(tenantGaId, isSuper)
  await apiRequest(
    `/api/admin/contracts/templates/${encodeURIComponent(templateId)}/confirmation-fields/${encodeURIComponent(fieldId)}${qs}`,
    { method: 'DELETE', token },
  )
}
