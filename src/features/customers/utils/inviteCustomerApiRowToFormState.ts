/**
 * 초대 고객 등록 GET 세션 응답(mapCustomerRow)을 CustomerFormState로 변환한다.
 */

import type { CustomerFormState } from '../../../components/customer/CustomerForm'
import { createEmptyCustomerForm } from '../../../components/customer/CustomerForm'
import { normalizeCustomerCrmExtension } from '../domain/crmExtension'
import type { CustomerNote } from '../domain/types'
import type { CustomerCarFormItem } from '../types/customerCarForm'

type ApiCustomerInvite = Record<string, unknown>

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** mapCustomerRow JSON — 보험 고객 기본 레이아웃 전제 */
export function inviteCustomerApiRowToFormState(row: ApiCustomerInvite): CustomerFormState {
  const base = createEmptyCustomerForm()
  const notesBag = row.notes as Record<string, unknown> | CustomerNote[] | undefined
  let notes: CustomerNote[] = []
  let insuranceHistory = ''
  if (Array.isArray(notesBag)) {
    notes = notesBag.filter((n): n is CustomerNote => n != null && typeof n === 'object')
  } else if (notesBag != null && typeof notesBag === 'object' && Array.isArray(notesBag.items)) {
    const items = notesBag.items as CustomerNote[]
    notes = Array.isArray(items) ? items : []
    insuranceHistory = typeof notesBag.insuranceHistory === 'string' ? notesBag.insuranceHistory : ''
  }

  const g = String(row.gender ?? '').trim()
  const gender = g === 'male' || g === 'female' ? g : null

  let isDriver: boolean | null = base.isDriver
  if (row.isDriver === true) isDriver = true
  else if (row.isDriver === false) isDriver = false

  const carNumber = str(row.carNumber)
  const carModel = str(row.carModel)
  const carYear = str(row.carYear)

  const cars: CustomerCarFormItem[] = [
    {
      ...base.cars[0],
      carNumber,
      carModel,
      carYear,
      isPrimary: true,
    },
  ]

  const crmBag = normalizeCustomerCrmExtension(row.crmExtension ?? row.crm_extension)

  const addr = str(row.address)
  const crmBirth =
    typeof crmBag.fields?.birthDate === 'string'
      ? crmBag.fields.birthDate.trim()
      : typeof crmBag.fields?.birth_date === 'string'
        ? crmBag.fields.birth_date.trim()
        : ''

  return {
    ...base,
    name: str(row.name).trim(),
    gender,
    ssn: str(row.ssn),
    phone: str(row.phone),
    carrier: str(row.carrier),
    birthDate: str(row.birthDate).trim() || crmBirth,
    address: addr,
    addressDetail: '',
    zonecode: '',
    height: str(row.height),
    weight: str(row.weight),
    job: str(row.job),
    isDriver,
    carType: str(row.carType),
    cars,
    medical: str(row.medical),
    insuranceHistory:
      insuranceHistory || (typeof row.insuranceHistory === 'string' ? row.insuranceHistory : ''),
    notes,
    noteDraft: '',
    crmExtensionFields: crmBag.fields ?? {},
  }
}
