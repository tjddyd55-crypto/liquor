import { apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import type {
  InsuranceContact,
  InsuranceContactsResponse,
  InsuranceContactUpdate,
  UpsertInsuranceContactPayload,
} from '../domain/types'
import { createVCardContent, openVCardInContactsApp } from '../utils/vcard'

export function getVCardDownloadUrl(contactId: string): string {
  return resolveApiUrl(`/api/insurance/contacts/${encodeURIComponent(contactId)}/vcard`)
}

/** Bearer 인증이 필요한 vCard 다운로드 */
export async function fetchInsuranceContactVCard(contactId: string, token: string): Promise<string> {
  const url = getVCardDownloadUrl(contactId)
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token.trim()}`,
    },
  })
  if (!response.ok) {
    throw new Error('vCard를 불러오지 못했습니다')
  }
  return response.text()
}

export async function getInsuranceContacts(token: string) {
  return apiRequest<InsuranceContactsResponse>('/api/insurance/contacts', { token })
}

export async function getInsuranceUpdates(token: string) {
  return apiRequest<InsuranceContactUpdate[]>('/api/insurance/updates', { token })
}

export async function createInsuranceContact(
  payload: UpsertInsuranceContactPayload,
  token: string,
) {
  return apiRequest<InsuranceContact>('/api/admin/insurance/contacts', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export async function updateInsuranceContact(
  contactId: string,
  payload: UpsertInsuranceContactPayload,
  token: string,
) {
  return apiRequest<InsuranceContact>(`/api/admin/insurance/contacts/${contactId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
}

export async function deleteInsuranceContact(
  contactId: string,
  token: string,
  description?: string,
) {
  return apiRequest<void>(`/api/admin/insurance/contacts/${contactId}`, {
    method: 'DELETE',
    token,
    body: JSON.stringify({ description }),
  })
}

export function downloadVCardFallback(contact: InsuranceContact) {
  openVCardInContactsApp(createVCardContent(contact))
}
