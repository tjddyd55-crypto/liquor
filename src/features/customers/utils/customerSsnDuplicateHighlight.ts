import type { CustomerRecord } from '../domain/types'
import type { CustomerSsnDupHighlight } from '../components/CustomerListCard'
import { normalizeSsn, RRN_NORMALIZED_LENGTH } from './customerExcelUpload'

/** 주민번호(숫자 13자리) 중복 그룹마다 순환 적용하는 표시색 */
const CUSTOMER_SSN_DUP_PALETTE = [
  'var(--distinct-hue-0)',
  'var(--distinct-hue-1)',
  'var(--distinct-hue-2)',
  'var(--distinct-hue-3)',
  'var(--distinct-hue-4)',
  'var(--distinct-hue-5)',
] as const

export function buildSsnDuplicateHighlightByCustomerId(rows: CustomerRecord[]): Map<number, CustomerSsnDupHighlight> {
  const byNorm = new Map<string, CustomerRecord[]>()
  for (const c of rows) {
    const k = normalizeSsn(c.ssn ?? '')
    if (k.length !== RRN_NORMALIZED_LENGTH) {
      continue
    }
    const arr = byNorm.get(k) ?? []
    arr.push(c)
    byNorm.set(k, arr)
  }
  const dupEntries = [...byNorm.entries()].filter(([, arr]) => arr.length > 1)
  dupEntries.sort(([a], [b]) => a.localeCompare(b))
  const out = new Map<number, CustomerSsnDupHighlight>()
  dupEntries.forEach(([, arr], idx) => {
    const groupLabel = idx + 1
    const color = CUSTOMER_SSN_DUP_PALETTE[idx % CUSTOMER_SSN_DUP_PALETTE.length]
    for (const c of arr) {
      out.set(c.id, { groupLabel, color })
    }
  })
  return out
}
