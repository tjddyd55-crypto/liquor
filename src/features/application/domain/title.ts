import type { InsuranceApplicationFormData } from './types'

function formatDatePart(isoDate: string): string {
  if (!isoDate) {
    const now = new Date()
    return now.toISOString().slice(0, 10)
  }

  return isoDate
}

export function buildApplicationTitle(data: InsuranceApplicationFormData): string {
  const ownerName = data.ownerName.trim() || '이름없음'
  const vehicleNumber = data.vehicleNumber.trim() || '차량번호없음'
  const date = formatDatePart(data.expiryDate)

  return `${ownerName} / ${vehicleNumber} / ${date}`
}
