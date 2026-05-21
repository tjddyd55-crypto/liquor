import { MOCK_LIFE_INSURERS, MOCK_NON_LIFE_INSURERS } from '../domain/mockCompanies'

export const ALL_INSURER_OPTIONS = Object.freeze([
  ...MOCK_LIFE_INSURERS,
  ...MOCK_NON_LIFE_INSURERS,
])

export function gaLabel(gaId: number): string {
  return `GA #${gaId}`
}

export function insurerLabel(insuranceCompanyId: string): string {
  return ALL_INSURER_OPTIONS.find((c) => c.id === insuranceCompanyId)?.name ?? insuranceCompanyId
}

export function pdfFileNameFromKey(storageKey: string): string {
  const parts = storageKey.split('/')
  return parts[parts.length - 1] || storageKey
}
