import { formatLocalYmd, parseBirthDateFromRrn } from './insuranceAge'
import type { CustomerRecord } from '../domain/types'

function formatDateYmdFromRaw(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const str = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10)
  return ''
}

/** birthDate 컬럼 우선, 없으면 주민번호 앞 7자리로 YYYY-MM-DD 파생 */
export function resolveCustomerBirthDateYmd(
  customer: Pick<CustomerRecord, 'birthDate' | 'ssn'> | null | undefined,
): string {
  if (!customer) return ''
  const fromColumn = formatDateYmdFromRaw(customer.birthDate ?? null)
  if (fromColumn) return fromColumn
  const fromRrn = parseBirthDateFromRrn(customer.ssn ?? '')
  if (!fromRrn) return ''
  return formatLocalYmd(fromRrn)
}
