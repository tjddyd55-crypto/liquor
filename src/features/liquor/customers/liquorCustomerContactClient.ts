import { apiRequest } from '../../../lib/apiClient'

export type LiquorCustomerContactInput = {
  name?: string
  birthDate?: string | null
  phone?: string
  jobTitle?: string
  roleLabel?: string
  email?: string
  isSignatureRecipient?: boolean
  memo?: string
  sortOrder?: number
}

export type LiquorCustomerContact = {
  id: number
  customerId?: number
  name: string
  birthDate: string | null
  phone: string
  jobTitle: string
  roleLabel: string
  email: string
  isSignatureRecipient: boolean
  memo: string
  sortOrder: number
}

function dateOnly(v: unknown): string | null {
  if (v == null || v === '') return null
  const s = String(v)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export function mapLiquorCustomerContact(row: Record<string, unknown>): LiquorCustomerContact {
  return {
    id: Number(row.id),
    customerId: row.customerId != null ? Number(row.customerId) : row.customer_id != null ? Number(row.customer_id) : undefined,
    name: String(row.name ?? ''),
    birthDate: dateOnly(row.birthDate ?? row.birth_date),
    phone: String(row.phone ?? ''),
    jobTitle: String(row.jobTitle ?? row.job_title ?? ''),
    roleLabel: String(row.roleLabel ?? row.role_label ?? ''),
    email: String(row.email ?? ''),
    isSignatureRecipient: Boolean(row.isSignatureRecipient ?? row.is_signature_recipient),
    memo: String(row.memo ?? ''),
    sortOrder: Number(row.sortOrder ?? row.sort_order ?? 0),
  }
}

export function validateLiquorContactInput(input: LiquorCustomerContactInput): string | null {
  const name = String(input.name ?? '').trim()
  const phone = String(input.phone ?? '').trim()
  if (!name && !phone) {
    return '이름 또는 연락처 중 하나는 입력해 주세요.'
  }
  return null
}

export async function createLiquorCustomerContact(
  token: string,
  customerId: number,
  body: LiquorCustomerContactInput,
): Promise<LiquorCustomerContact> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/contacts`,
    { method: 'POST', token, body },
  )
  return mapLiquorCustomerContact(res.data ?? {})
}

export async function updateLiquorCustomerContact(
  token: string,
  customerId: number,
  contactId: number,
  body: LiquorCustomerContactInput,
): Promise<LiquorCustomerContact> {
  const res = await apiRequest<{ ok?: boolean; data?: Record<string, unknown> }>(
    `/api/liquor/customers/${customerId}/contacts/${contactId}`,
    { method: 'PATCH', token, body },
  )
  return mapLiquorCustomerContact(res.data ?? {})
}

export async function deleteLiquorCustomerContact(token: string, customerId: number, contactId: number): Promise<void> {
  await apiRequest(`/api/liquor/customers/${customerId}/contacts/${contactId}`, { method: 'DELETE', token })
}
