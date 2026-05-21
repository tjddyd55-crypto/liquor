export type GovSupportProfile = {
  id: string
  tenantId: string
  customerName: string
  phone: string
  carrier: string
  ssn: string
  homeAddress: string
  homeType: string
  deposit: string
  monthlyRent: string
  creditScore1: string
  creditScore2: string
  businessName: string
  businessOpenedAt: string
  businessNumber: string
  businessAddress: string
  businessCategory: string
  businessType: string
  businessForm: string
  businessPhone: string
  productName: string
  availableProduct: string
  progressStatus: string
  scheduleAt: string
  agencyOrg: string
  assigneeUserId: string | null
  region: string
  note: string
  specialNote: string
  vatReport: string
  annualIncome: string
  incomeCert: string
  taxArrears: string
  requiredFunds: string
  fee: string
  certDelegate: string
  certType: string
  delegateStatus: string
  delegationMemo: string
  edocStatus: string
  docStatus: string
}

export type GovAgencyRow = {
  id: string
  agencyCode: string
  name: string
  status: string
}

export type GovPriorLoan = {
  id: string
  profileId: string
  hasPrior: string
  lenderName: string
  remainingAmount: string
  receivedAt: string
  policyIncluded: string
  memo: string
}

export type GovApplicationCase = {
  id: string
  profileId: string
  productName: string
  availableProduct: string
  progressStatus: string
  scheduleAt: string
  agencyOrg: string
  requiredFunds: string
  fee: string
  certDelegate: string
  specialNote: string
}

export type GovProfileMemo = {
  id: string
  profileId: string
  ownerUserId: string
  content: string
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

/** 보험 CustomerConsultationRow 대응 — UI 복사 호환 필드(body, consultationDate) 포함 */
export type GovProfileConsultation = {
  id: string
  profileId: string
  ownerUserId: string
  consultationType: string
  title: string
  content: string
  body: string
  status: string
  consultedAt: string | null
  consultationDate: string | null
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type GovProfileProgressEvent = {
  id: string
  profileId: string
  ownerUserId: string
  status: string
  title: string
  content: string
  eventDate: string | null
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export type GovProfileFile = {
  id: string
  profileId: string
  ownerUserId: string
  fileName: string
  fileKey: string
  fileSize: number
  mimeType: string
  category: string
  description: string
  uploadStatus: string
  createdByUserId: string | null
  updatedByUserId: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}
