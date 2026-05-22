import { apiRequest } from '../../../lib/apiClient'

export type LiquorTenantCompanyProfile = {
  representativeName: string
  businessName: string
  businessRegistrationNumber: string
  businessAddress: string
  representativePhone: string
  businessPhone: string
  email: string
  bankName: string
  bankAccountNumber: string
  bankAccountHolder: string
  signatureSenderName: string
  signatureSenderPhone: string
}

export const EMPTY_LIQUOR_TENANT_COMPANY_PROFILE: LiquorTenantCompanyProfile = {
  representativeName: '',
  businessName: '',
  businessRegistrationNumber: '',
  businessAddress: '',
  representativePhone: '',
  businessPhone: '',
  email: '',
  bankName: '',
  bankAccountNumber: '',
  bankAccountHolder: '',
  signatureSenderName: '',
  signatureSenderPhone: '',
}

type DbRow = Record<string, unknown>

function str(v: unknown): string {
  return String(v ?? '').trim()
}

export function mapLiquorTenantCompanyProfileRow(row: DbRow | null | undefined): LiquorTenantCompanyProfile {
  if (!row) return { ...EMPTY_LIQUOR_TENANT_COMPANY_PROFILE }
  return {
    representativeName: str(row.representative_name ?? row.representativeName),
    businessName: str(row.business_name ?? row.businessName),
    businessRegistrationNumber: str(row.business_registration_number ?? row.businessRegistrationNumber),
    businessAddress: str(row.business_address ?? row.businessAddress),
    representativePhone: str(row.representative_phone ?? row.representativePhone),
    businessPhone: str(row.business_phone ?? row.businessPhone),
    email: str(row.email),
    bankName: str(row.bank_name ?? row.bankName),
    bankAccountNumber: str(row.bank_account_number ?? row.bankAccountNumber),
    bankAccountHolder: str(row.bank_account_holder ?? row.bankAccountHolder),
    signatureSenderName: str(row.signature_sender_name ?? row.signatureSenderName),
    signatureSenderPhone: str(row.signature_sender_phone ?? row.signatureSenderPhone),
  }
}

export async function fetchLiquorTenantCompanyProfile(token: string): Promise<LiquorTenantCompanyProfile> {
  const res = await apiRequest<{ ok?: boolean; data?: DbRow | null }>('/api/liquor/tenant/company-profile', {
    method: 'GET',
    token,
  })
  return mapLiquorTenantCompanyProfileRow(res.data ?? null)
}

export async function saveLiquorTenantCompanyProfile(
  token: string,
  body: LiquorTenantCompanyProfile,
): Promise<LiquorTenantCompanyProfile> {
  const res = await apiRequest<{ ok?: boolean; data?: DbRow }>('/api/liquor/tenant/company-profile', {
    method: 'PUT',
    token,
    body,
  })
  return mapLiquorTenantCompanyProfileRow(res.data)
}
