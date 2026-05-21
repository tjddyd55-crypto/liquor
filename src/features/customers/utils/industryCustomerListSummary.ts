import type { CustomerIndustryTemplate } from '../../customer-templates/customerTemplate.types'
import { getListColumnDefinition } from '../../customer-templates'
import type { CustomerRecord } from '../domain/types'
import { formatDateYmdInput } from './insuranceInfo'
import { getCustomerListMetrics } from './customerListMetrics'

function trimOrDash(raw: unknown): string | null {
  if (raw == null) return null
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
  return s ? s : null
}

function resolveListColumnDisplayMode(
  col: { displayType?: string },
  template: CustomerIndustryTemplate,
  sourceFieldKey: string,
): 'text' | 'date' | 'number' {
  const configured = String(col.displayType ?? 'auto').trim().toLowerCase()
  if (configured === 'text' || configured === 'date' || configured === 'number') {
    return configured
  }
  const field = template.formFields.find((f) => f.fieldKey.trim() === sourceFieldKey.trim())
  const w = String(field?.widget ?? 'text').toLowerCase()
  if (w === 'date') return 'date'
  if (w === 'number') return 'number'
  return 'text'
}

function formatListColumnCellDisplay(raw: string | null, mode: 'text' | 'date' | 'number'): string | null {
  if (raw == null) return null
  const s = typeof raw === 'string' ? raw.trim() : String(raw).trim()
  if (!s) return null
  if (mode === 'number') {
    const normalized = s.replace(/,/g, '')
    const n = Number(normalized)
    if (Number.isFinite(n)) return String(n)
    return s
  }
  if (mode === 'date') {
    const d = formatDateYmdInput(s)
    return d === '-' ? null : d
  }
  return s
}

/**
 * 목록 칼럼 `sourceFieldKey` 중 DB CustomerRecord 에 바로 꺼낼 수 있는 것만 문자열화한다.
 * 확장 필드·동적 빌더 목록 컬럼은 crm_extension.fields 등에서 조회한다.
 */
export function industryListColumnValue(customer: CustomerRecord, sourceFieldKey: string): string | null {
  switch (sourceFieldKey) {
    case 'customer.name':
      return trimOrDash(customer.name)
    case 'customer.phone':
      return trimOrDash(customer.phone ?? customer.phoneNumber)
    case 'customer.ssn':
      return trimOrDash(customer.ssn)
    case 'customer.gender':
      if (customer.gender === 'male') return '남'
      if (customer.gender === 'female') return '여'
      return null
    case 'customer.job':
      return trimOrDash(customer.job)
    case 'customer.address':
      return trimOrDash(customer.address)
    case 'customer.createdAt':
      return trimOrDash(customer.createdAt)
    case 'customer.isFavorite':
      return customer.isFavorite ? '★' : null
    case 'customer.lastConsultDate':
    case 'consultation.lastDate': {
      const d = trimOrDash(customer.lastConsultDate)
      return d && d !== '-' ? d : null
    }
    case 'insurance.insuranceAge': {
      const n = customer.insuranceAge
      return n != null && Number.isFinite(n) ? `${n}세` : null
    }
    case 'insurance.renewalDate':
    case 'vehicle.renewalDate': {
      const m = getCustomerListMetrics(customer)
      return trimOrDash(m.maturityYmd)
    }
    case 'customer.birthDate':
      return trimOrDash(customer.birthDate)
    case 'customer.carrier':
      return trimOrDash(customer.carrier)
    case 'customer.memo': {
      const ex = customer.crmExtension?.fields?.['customer.memo']
      if (trimOrDash(ex)) return trimOrDash(ex)
      return trimOrDash(customer.medical)
    }
    default: {
      const ex = customer.crmExtension?.fields?.[sourceFieldKey]
      return trimOrDash(ex)
    }
  }
}

/** 업종 카드 요약 두 번째 줄(템플릿 listColumns 순·가시 필드 우선). */
export function formatIndustryCustomerListSecondaryLine(
  customer: CustomerRecord,
  template: CustomerIndustryTemplate,
): string {
  const cols = [...template.listColumns]
    .filter((c) => c.visibleDefault !== false)
    .sort((a, b) => a.order - b.order)

  const parts: string[] = []
  for (const col of cols) {
    if (parts.length >= 6) break

    let v: string | null = null
    if (col.columnKey === 'lastConsultDate') {
      const raw = industryListColumnValue(customer, 'customer.lastConsultDate')
      v = formatListColumnCellDisplay(
        raw,
        resolveListColumnDisplayMode(col, template, 'customer.lastConsultDate'),
      )
    } else {
      const sfk = typeof col.sourceFieldKey === 'string' && col.sourceFieldKey.trim()
        ? col.sourceFieldKey.trim()
        : null
      if (sfk) {
        const raw = industryListColumnValue(customer, sfk)
        const mode = resolveListColumnDisplayMode(col, template, sfk)
        v = formatListColumnCellDisplay(raw, mode)
      } else {
        const def = getListColumnDefinition(col.columnKey)
        if (!def?.sourceFieldKey) continue
        if (def.sourceType === 'aggregate' && col.columnKey !== 'lastConsultDate') continue
        const sk = String(def.sourceFieldKey)
        const raw = industryListColumnValue(customer, sk)
        v = formatListColumnCellDisplay(raw, resolveListColumnDisplayMode(col, template, sk))
      }
    }
    if (!v) continue
    parts.push(`${col.label}: ${v}`)
  }

  if (parts.length > 0) {
    return parts.join(' · ')
  }

  const consult = customer.lastConsultDate ? formatDateYmdInput(customer.lastConsultDate) : '—'
  const job = trimOrDash(customer.job)
  const phone = trimOrDash(customer.phone ?? customer.phoneNumber)
  return [job ? `직업 ${job}` : null, phone ? `연락처 ${phone}` : null, `상담일 ${consult}`]
    .filter(Boolean)
    .join(' · ')
}
