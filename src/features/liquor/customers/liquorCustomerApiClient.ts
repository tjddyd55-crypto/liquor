import { apiRequest } from '../../../lib/apiClient'

export type LiquorPartyType = 'individual' | 'business'

export type LiquorCustomerProfile = {
  customerId: number
  partyType: LiquorPartyType
  residentIdMasked: string
  individualEmail?: string
  businessRepresentativeName?: string
  businessName?: string
  businessRegistrationNumber?: string
  businessAddress?: string
  storePhone?: string
  businessType?: string
  businessItem?: string
  businessOpenedOn?: string | null
  businessEmail?: string
  accountStatus?: string
  tradeStartedOn?: string | null
  memo?: string
}

export type LiquorCustomerDetail = {
  profile: LiquorCustomerProfile | null
  contacts: Array<Record<string, unknown>>
  supportContracts: Array<Record<string, unknown>>
  repayments: Array<Record<string, unknown>>
  supportItems: Array<Record<string, unknown>>
  files: Array<Record<string, unknown>>
  notes: Array<Record<string, unknown>>
  summary: {
    totalSupportAmount: number
    totalRepaidAmount: number
    totalBalanceAmount: number
    overdueAmount: number
    latestRepaymentOn: string | null
    nextRepaymentDueOn: string | null
  }
}

export async function fetchLiquorCustomerDetail(token: string, customerId: number): Promise<LiquorCustomerDetail> {
  const res = await apiRequest<{ ok?: boolean; data?: LiquorCustomerDetail }>(
    `/api/liquor/customers/${customerId}/detail`,
    { method: 'GET', token },
  )
  return res.data ?? (res as unknown as LiquorCustomerDetail)
}

export async function saveLiquorCustomerProfile(
  token: string,
  customerId: number,
  body: Partial<LiquorCustomerProfile> & { residentId?: string },
): Promise<LiquorCustomerProfile> {
  const res = await apiRequest<{ ok?: boolean; data?: LiquorCustomerProfile }>(
    `/api/liquor/customers/${customerId}/profile`,
    { method: 'PUT', token, body },
  )
  return res.data!
}

export async function createLiquorSupportItem(token: string, customerId: number, body: Record<string, unknown>) {
  return apiRequest(`/api/liquor/customers/${customerId}/support-items`, { method: 'POST', token, body })
}

export async function createLiquorCustomerNote(token: string, customerId: number, body: string) {
  return apiRequest(`/api/liquor/customers/${customerId}/notes`, { method: 'POST', token, body: { body } })
}
