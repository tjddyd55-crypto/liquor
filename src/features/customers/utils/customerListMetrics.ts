import type { CustomerRecord } from '../domain/types'
import { calculateInsuranceAgeFromRrn, formatLocalYmd } from './insuranceAge'
import { formatDateYmdInput } from './insuranceInfo'

export type CustomerListMetrics = {
  insuranceAge: number | null
  maturityYmd: string | null
}

export function getCustomerListMetrics(c: CustomerRecord): CustomerListMetrics {
  const computed = calculateInsuranceAgeFromRrn(c.ssn ?? '')
  if (computed) {
    return {
      insuranceAge: computed.insuranceAge,
      maturityYmd: formatLocalYmd(computed.maturityDate),
    }
  }
  if (c.insuranceAge != null && c.nextAgeDate) {
    const ymd = formatDateYmdInput(c.nextAgeDate)
    return {
      insuranceAge: c.insuranceAge,
      maturityYmd: ymd !== '-' ? ymd : null,
    }
  }
  return { insuranceAge: null, maturityYmd: null }
}
