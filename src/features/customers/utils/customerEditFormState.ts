import type { CustomerRecord } from '../domain/types'
import { normalizeCustomerNotesBag } from '../domain/types'
import type { CustomerEditFormState } from '../types/customerEditForm'
import { customerRecordToCarFormItems } from './customerCarFormUtils'
import { inferGenderFromResidentNumberDigits } from './inferGenderFromResidentNumberDigits'

export function inferIsDriverFromDriving(driving: string): boolean | null {
  const t = String(driving ?? '').trim()
  if (!t) {
    return null
  }
  if (t.includes('운전 안함') || t.includes('안 함')) {
    return false
  }
  if (t.startsWith('운전함') || t === '운전') {
    return true
  }
  return null
}

export function recordToEditForm(c: CustomerRecord): CustomerEditFormState {
  let isDriver = c.isDriver
  if (isDriver == null) {
    isDriver = inferIsDriverFromDriving(c.driving)
  }
  const storedGender = c.gender ?? null
  return {
    name: c.name ?? '',
    gender: storedGender ?? inferGenderFromResidentNumberDigits(c.ssn ?? '') ?? null,
    ssn: c.ssn ?? '',
    phone: c.phone ?? '',
    carrier: (c.carrier ?? '').trim(),
    birthDate: c.birthDate ? String(c.birthDate).slice(0, 10) : '',
    address: c.address ?? '',
    addressDetail: '',
    zonecode: '',
    height: c.height ?? '',
    weight: c.weight ?? '',
    job: c.job ?? '',
    isDriver,
    carType: c.carType ?? '',
    medical: c.medical ?? '',
    insuranceHistory: normalizeCustomerNotesBag(c.notes).insuranceHistory,
    cars: customerRecordToCarFormItems(c),
    crmExtensionFields: { ...(c.crmExtension?.fields ?? {}) },
  }
}

export function normalizeCustomerEditCarYearForApi(raw: string | undefined): string {
  return String(raw ?? '').replace(/\D/g, '')
}

export function normalizeCustomerEditRenewalDateForApi(raw: string | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) {
    return ''
  }
  const head = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

/** 생년월일 저장용 — 빈 값은 `''`, 유효 YYYY-MM-DD만 허용, 그 외는 payload 에서 제외(null). */
export function normalizeBirthDateForSaveApi(raw: string | null | undefined): string | null {
  const s = String(raw ?? '').trim()
  if (!s) {
    return ''
  }
  const head = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : null
}
