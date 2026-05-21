/**
 * PDF 매핑에 허용되는 고객 필드 키 — customers API(mapCustomerRow) 와 1:1.
 */

import { resolveCustomerBirthDateYmd } from '../../lib/customerBirthDateResolve.js'

export const CUSTOMER_PDF_FIELD_OPTIONS = Object.freeze([
  { key: 'name', label: '고객명' },
  { key: 'phone', label: '연락처' },
  { key: 'birthDate', label: '생년월일' },
  { key: 'residentRegistrationNumber', label: '주민번호' },
  { key: 'gender', label: '성별' },
  { key: 'insuranceAge', label: '보험나이' },
  { key: 'address', label: '주소' },
  { key: 'job', label: '직업' },
  { key: 'carNumber', label: '차량번호' },
  { key: 'carModel', label: '차종' },
  { key: 'carYear', label: '연식' },
  { key: 'carInsuranceExpiryDate', label: '자동차보험 만기일' },
  { key: 'driverLicense', label: '운전 여부' },
  { key: 'carType', label: '차종(자유입력)' },
  { key: 'customerCode', label: '고객번호' },
  { key: 'height', label: '키' },
  { key: 'weight', label: '몸무게' },
  { key: 'medical', label: '병력' },
])

const ALLOWED_KEYS = new Set(CUSTOMER_PDF_FIELD_OPTIONS.map((o) => o.key))

/**
 * @param {string | null | undefined} key
 */
export function isAllowedCustomerPdfFieldKey(key) {
  return typeof key === 'string' && ALLOWED_KEYS.has(key)
}

function formatDateYmd(value) {
  if (value == null) return ''
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return ''
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const str = String(value).trim()
  if (!str) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10)
  return ''
}

function formatGender(value) {
  if (value === 'male') return '남'
  if (value === 'female') return '여'
  return ''
}

function formatDriver(value, drivingText) {
  if (value === true) return '운전'
  if (value === false) return '미운전'
  const d = String(drivingText ?? '').trim()
  return d
}

/**
 * @param {Record<string, unknown> | null | undefined} customer
 * @param {string} fieldKey
 * @returns {string}
 */
export function pickCustomerPdfFieldValue(customer, fieldKey) {
  if (!customer || !isAllowedCustomerPdfFieldKey(fieldKey)) {
    return ''
  }
  const c = customer
  switch (fieldKey) {
    case 'name':
      return String(c.name ?? '').trim()
    case 'phone':
      return String(c.phone ?? c.phoneNumber ?? '').trim()
    case 'birthDate':
      return resolveCustomerBirthDateYmd(c)
    case 'residentRegistrationNumber':
      return String(c.ssn ?? '').trim()
    case 'gender':
      return formatGender(c.gender)
    case 'insuranceAge':
      return c.insuranceAge != null && Number.isFinite(Number(c.insuranceAge))
        ? String(c.insuranceAge)
        : ''
    case 'address':
      return String(c.address ?? '').trim()
    case 'job':
      return String(c.job ?? '').trim()
    case 'carNumber':
      return String(c.carNumber ?? '').trim()
    case 'carModel':
      return String(c.carModel ?? '').trim()
    case 'carYear':
      return String(c.carYear ?? '').trim()
    case 'carInsuranceExpiryDate':
      return formatDateYmd(c.renewalDate)
    case 'driverLicense':
      return formatDriver(c.isDriver, c.driving)
    case 'carType':
      return String(c.carType ?? '').trim()
    case 'customerCode':
      return c.customerCode != null ? String(c.customerCode).trim() : ''
    case 'height':
      return String(c.height ?? '').trim()
    case 'weight':
      return String(c.weight ?? '').trim()
    case 'medical':
      return String(c.medical ?? '').trim()
    default:
      return ''
  }
}
