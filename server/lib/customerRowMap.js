/**
 * Customers 테이블 행 → 공개 API 형식 (server/index.js 와 동일 규약).
 */
import { parseCrmExtensionFromDb } from './customerCrmExtension.js'

export function normalizeExpiryDate(value) {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed
  }
  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) {
    return ''
  }
  return parsed.toISOString().slice(0, 10)
}

export function toIsoString(value) {
  if (value instanceof Date) {
    return value.toISOString()
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return String(value ?? '')
  }
  return parsed.toISOString()
}

function normalizeCustomerNoteItemsArray(itemsRaw) {
  if (!Array.isArray(itemsRaw)) {
    return []
  }
  const out = []
  for (const item of itemsRaw) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const id = String(item.id ?? '').trim()
    const content = String(item.content ?? '').trim()
    const createdAt = String(item.createdAt ?? new Date().toISOString()).trim()
    if (!id || !content) {
      continue
    }
    out.push({ id, content, createdAt })
  }
  return out
}

/** API 응답: { items, insuranceHistory } — 레거시 배열도 수용 */
export function mapCustomerNotesJson(raw) {
  if (raw == null) {
    return { items: [], insuranceHistory: '' }
  }
  if (Array.isArray(raw)) {
    return { items: normalizeCustomerNoteItemsArray(raw), insuranceHistory: '' }
  }
  if (typeof raw === 'object') {
    const insuranceHistory = String(raw.insuranceHistory ?? '').trim()
    const items = normalizeCustomerNoteItemsArray(raw.items)
    return { items, insuranceHistory }
  }
  return { items: [], insuranceHistory: '' }
}

export function mapCustomerRow(row) {
  const renewalRaw = row.renewal_date ?? ''
  const renewalDate =
    renewalRaw instanceof Date
      ? normalizeExpiryDate(renewalRaw.toISOString().slice(0, 10))
      : normalizeExpiryDate(String(renewalRaw))

  const g = String(row.gender ?? '').trim()
  const gender = g === 'male' || g === 'female' ? g : null

  let isDriver = null
  if (row.is_driver === true) {
    isDriver = true
  } else if (row.is_driver === false) {
    isDriver = false
  }

  const nextRaw = row.next_age_date ?? null
  let nextAgeDate = null
  if (nextRaw instanceof Date) {
    nextAgeDate = normalizeExpiryDate(nextRaw.toISOString().slice(0, 10))
  } else if (nextRaw) {
    nextAgeDate = normalizeExpiryDate(String(nextRaw).slice(0, 10))
  }

  const insRaw = row.insurance_age
  const insuranceAge =
    insRaw != null && insRaw !== '' && Number.isFinite(Number(insRaw)) ? Number(insRaw) : null

  const lastConsultRaw = row.last_consult_date ?? row.lastConsultDate ?? null
  let lastConsultDate = null
  if (lastConsultRaw instanceof Date) {
    lastConsultDate = lastConsultRaw.toISOString().slice(0, 10)
  } else if (lastConsultRaw) {
    const parsed = new Date(String(lastConsultRaw))
    if (!Number.isNaN(parsed.getTime())) {
      lastConsultDate = parsed.toISOString().slice(0, 10)
    } else {
      const ymd = String(lastConsultRaw).slice(0, 10)
      lastConsultDate = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
    }
  }

  let birthDate = null
  const bdRaw = row.birth_date
  if (bdRaw instanceof Date) {
    birthDate = bdRaw.toISOString().slice(0, 10)
  } else if (bdRaw) {
    birthDate = String(bdRaw).slice(0, 10)
  }

  const crmParsed = parseCrmExtensionFromDb(row.crm_extension ?? row.crmExtension)

  return {
    id: Number(row.id),
    userId: String(row.user_id),
    name: row.name ?? '',
    customerCode: row.customer_code != null ? String(row.customer_code) : null,
    birthDate,
    ssn: row.ssn ?? '',
    gender,
    insuranceAge,
    nextAgeDate: nextAgeDate || null,
    isDriver,
    carType: row.car_type ?? '',
    notes: mapCustomerNotesJson(row.notes),
    phone: row.phone ?? row.phone_number ?? '',
    carrier: row.carrier ?? '',
    address: row.address ?? '',
    height: row.height ?? '',
    weight: row.weight ?? '',
    job: row.job ?? '',
    driving: row.driving ?? '',
    medical: row.medical ?? '',
    carNumber: row.car_number ?? '',
    carModel: row.car_model ?? '',
    carYear: row.car_year ?? '',
    renewalDate,
    lastConsultDate,
    isFavorite: row.is_favorite === true,
    crmExtension: crmParsed,
    createdAt: toIsoString(row.created_at),
  }
}
