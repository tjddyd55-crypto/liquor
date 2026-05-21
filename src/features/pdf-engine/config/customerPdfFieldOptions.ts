/**
 * PDF 좌표 필드 ↔ 고객 데이터 매핑 옵션 (CustomerRecord 기준).
 */

import type { CustomerRecord } from '../../customers/domain/types'
import { resolveCustomerBirthDateYmd } from '../../customers/utils/resolveCustomerBirthDateYmd'

export type CustomerPdfFieldKey =
  | 'name'
  | 'phone'
  | 'birthDate'
  | 'residentRegistrationNumber'
  | 'gender'
  | 'insuranceAge'
  | 'address'
  | 'job'
  | 'carNumber'
  | 'carModel'
  | 'carYear'
  | 'carInsuranceExpiryDate'
  | 'driverLicense'
  | 'carType'
  | 'customerCode'
  | 'height'
  | 'weight'
  | 'medical'

/** PDF 매핑 중 자동차 정보(다중 차량 선택과 연동되는 키만). driverLicense 등은 제외. */
const CUSTOMER_PDF_CAR_FIELD_KEYS = new Set<CustomerPdfFieldKey>([
  'carNumber',
  'carModel',
  'carYear',
  'carInsuranceExpiryDate',
  'carType',
])

export function isCustomerPdfCarFieldKey(key: string | null | undefined): key is CustomerPdfFieldKey {
  return typeof key === 'string' && CUSTOMER_PDF_CAR_FIELD_KEYS.has(key as CustomerPdfFieldKey)
}

export const CUSTOMER_PDF_FIELD_OPTIONS: ReadonlyArray<{
  key: CustomerPdfFieldKey
  label: string
}> = [
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
]

const ALLOWED = new Set<string>(CUSTOMER_PDF_FIELD_OPTIONS.map((o) => o.key))

export function isCustomerPdfFieldKey(key: string | null | undefined): key is CustomerPdfFieldKey {
  return typeof key === 'string' && ALLOWED.has(key)
}

function formatDateYmd(value: string | null | undefined): string {
  if (!value?.trim()) return ''
  const str = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  if (/^\d{4}-\d{2}-\d{2}T/.test(str)) return str.slice(0, 10)
  return ''
}

function formatGender(value: CustomerRecord['gender']): string {
  if (value === 'male') return '남'
  if (value === 'female') return '여'
  return ''
}

function formatDriver(isDriver: CustomerRecord['isDriver'], driving: string): string {
  if (isDriver === true) return '운전'
  if (isDriver === false) return '미운전'
  return driving.trim()
}

/** 허용된 키만 — CustomerRecord 에서 PDF 입력 문자열 추출 */
export function pickCustomerPdfFieldValue(customer: CustomerRecord, fieldKey: CustomerPdfFieldKey): string {
  switch (fieldKey) {
    case 'name':
      return customer.name.trim()
    case 'phone':
      return (customer.phone || customer.phoneNumber || '').trim()
    case 'birthDate':
      return resolveCustomerBirthDateYmd(customer)
    case 'residentRegistrationNumber':
      return customer.ssn.trim()
    case 'gender':
      return formatGender(customer.gender)
    case 'insuranceAge':
      return customer.insuranceAge != null ? String(customer.insuranceAge) : ''
    case 'address':
      return customer.address.trim()
    case 'job':
      return customer.job.trim()
    case 'carNumber':
      return customer.carNumber.trim()
    case 'carModel':
      return customer.carModel.trim()
    case 'carYear':
      return customer.carYear.trim()
    case 'carInsuranceExpiryDate':
      return formatDateYmd(customer.renewalDate)
    case 'driverLicense':
      return formatDriver(customer.isDriver, customer.driving)
    case 'carType':
      return customer.carType.trim()
    case 'customerCode':
      return customer.customerCode?.trim() ?? ''
    case 'height':
      return customer.height.trim()
    case 'weight':
      return customer.weight.trim()
    case 'medical':
      return customer.medical.trim()
    default:
      return ''
  }
}

export function labelForCustomerPdfFieldKey(key: string | null | undefined): string {
  const found = CUSTOMER_PDF_FIELD_OPTIONS.find((o) => o.key === key)
  return found?.label ?? ''
}
