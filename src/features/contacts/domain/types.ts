export type InsuranceContactCategory = 'LIFE' | 'NON_LIFE' | 'GENERAL'
export type InsuranceContactActionType = 'CREATE' | 'UPDATE' | 'DELETE'

export interface InsuranceContact {
  id: string
  category: InsuranceContactCategory
  companyName: string
  managerName: string
  position: string
  phoneNumber: string
  createdAt: string
  updatedAt: string
}

export interface InsuranceContactsResponse {
  lastUpdatedAt: string
  contacts: InsuranceContact[]
}

export interface InsuranceContactUpdate {
  id: string
  contactId: string | null
  actionType: InsuranceContactActionType
  category: InsuranceContactCategory
  companyName: string
  managerName: string
  position: string
  oldPhoneNumber: string
  newPhoneNumber: string
  description: string
  createdAt: string
}

export interface UpsertInsuranceContactPayload {
  category: InsuranceContactCategory
  companyName: string
  managerName: string
  position: string
  phoneNumber: string
  description?: string
}
