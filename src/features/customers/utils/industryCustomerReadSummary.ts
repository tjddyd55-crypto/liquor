import { resolveCanonicalFieldKey } from '../../customer-templates'
import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import type { CustomerRecord } from '../domain/types'

/** 업종 고객 읽기/상세에 쓰이는 단일 필드 표시 문자열(canonical 기준). */
export function readIndustryCanonDisplayValue(customer: CustomerRecord, canonicalKey: string): string {
  switch (canonicalKey) {
    case 'customer.name':
      return customer.name ?? ''
    case 'customer.phone':
      return customer.phone ?? customer.phoneNumber ?? ''
    case 'customer.ssn':
    case 'insurance.ssn':
      return customer.ssn ?? ''
    case 'customer.gender':
      if (customer.gender === 'male') return '남'
      if (customer.gender === 'female') return '여'
      return ''
    case 'customer.address':
      return customer.address ?? ''
    case 'customer.job':
      return customer.job ?? ''
    case 'customer.height':
      return customer.height ?? ''
    case 'customer.weight':
      return customer.weight ?? ''
    case 'customer.birthDate':
      return customer.birthDate ? String(customer.birthDate).slice(0, 10) : ''
    case 'customer.carrier':
      return customer.carrier ?? ''
    case 'customer.memo': {
      const ex = customer.crmExtension?.fields?.['customer.memo']
      return (ex ?? '').trim() || customer.medical || ''
    }
    default:
      return customer.crmExtension?.fields?.[canonicalKey] ?? ''
  }
}

export function industryTemplateReadPreviewRows(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
  maxRows = 16,
): { label: string; value: string; canonicalKey: string }[] {
  const sorted = [...template.formFields]
    .filter((f) => f.visibleDefault !== false)
    .sort((a, b) => a.order - b.order)

  const seen = new Set<string>()
  const out: { label: string; value: string; canonicalKey: string }[] = []

  for (const f of sorted) {
    if (out.length >= maxRows) break
    const canon = resolveCanonicalFieldKey(f.fieldKey)
    if (seen.has(canon)) continue
    seen.add(canon)
    const raw = readIndustryCanonDisplayValue(customer, canon).trim()
    if (!raw) continue
    out.push({ label: f.label, value: raw, canonicalKey: canon })
  }
  return out
}

/** 동적 탭: 지정 필드 키 순서대로만 행을 생성한다(값이 없으면 건너뜀). */
export function industryTemplateReadPreviewRowsForFieldKeys(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
  fieldKeys: readonly string[],
  maxRows = 32,
): { label: string; value: string; canonicalKey: string }[] {
  const byKey = new Map<string, (typeof template.formFields)[number]>()
  for (const f of template.formFields) {
    const canon = resolveCanonicalFieldKey(f.fieldKey)
    byKey.set(canon, f as (typeof template.formFields)[number])
  }
  const out: { label: string; value: string; canonicalKey: string }[] = []
  const seen = new Set<string>()
  for (const fk of fieldKeys) {
    if (out.length >= maxRows) break
    const canon = resolveCanonicalFieldKey(fk)
    if (seen.has(canon)) continue
    seen.add(canon)
    const f = byKey.get(canon)
    const label = f?.label?.trim() || canon
    const raw = readIndustryCanonDisplayValue(customer, canon).trim()
    if (!raw) continue
    out.push({ label, value: raw, canonicalKey: canon })
  }
  return out
}
