import type { CustomerCarFormItem } from '../types/customerCarForm'
import {
  createCustomerCar,
  deleteCustomerCar,
  listCustomerCars,
  updateCustomerCar,
  type CustomerCarInput,
  type CustomerCarRecord,
} from '../api/customerCarsApi'
import { isCustomerCarEmpty, normalizeCustomerCarsForSave } from './customerCarFormUtils'

export function customerCarRecordToFormItem(r: CustomerCarRecord): CustomerCarFormItem {
  return {
    id: r.id,
    carNumber: r.carNumber ?? '',
    carModel: r.carModel ?? '',
    carYear: r.carYear ?? '',
    renewalDate: r.renewalDate ? String(r.renewalDate).slice(0, 10) : '',
    carType: r.carType ?? '',
    memo: r.memo ?? '',
    isPrimary: r.isPrimary === true,
  }
}

function trim(s: string | undefined): string {
  return String(s ?? '').trim()
}

function formItemToInput(car: CustomerCarFormItem, isPrimary: boolean): CustomerCarInput {
  const renewal = trim(car.renewalDate)
  return {
    carType: trim(car.carType),
    carNumber: trim(car.carNumber),
    carModel: trim(car.carModel),
    carYear: trim(car.carYear),
    renewalDate: renewal,
    memo: trim(car.memo),
    isPrimary,
  }
}

function recordEqualsForm(rec: CustomerCarRecord, car: CustomerCarFormItem, isPrimary: boolean): boolean {
  const rDate = rec.renewalDate ? String(rec.renewalDate).slice(0, 10) : ''
  return (
    trim(rec.carType) === trim(car.carType) &&
    trim(rec.carNumber) === trim(car.carNumber) &&
    trim(rec.carModel) === trim(car.carModel) &&
    trim(rec.carYear) === trim(car.carYear) &&
    rDate === trim(car.renewalDate) &&
    trim(rec.memo) === trim(car.memo) &&
    rec.isPrimary === isPrimary
  )
}

function primaryFormIndex(norm: CustomerCarFormItem[]): number {
  const marked = norm.findIndex((c) => c.isPrimary === true)
  if (marked >= 0) {
    return marked
  }
  const first = norm.findIndex((c) => !isCustomerCarEmpty(c))
  if (first >= 0) {
    return first
  }
  return 0
}

/**
 * customer_cars 테이블을 폼 상태와 일치시킨다. 고객 기본정보 저장 이후 호출.
 */
export async function saveCustomerCarsForCustomer(params: {
  token: string
  customerId: number
  formCars: CustomerCarFormItem[]
}): Promise<void> {
  const { token, customerId, formCars } = params
  const norm = normalizeCustomerCarsForSave(formCars)
  const current = await listCustomerCars(token, customerId)

  if (norm.length === 0) {
    for (const r of current) {
      await deleteCustomerCar(token, customerId, r.id)
    }
    return
  }

  const pIdx = primaryFormIndex(norm)
  const formIds = new Set(
    norm.map((c) => c.id).filter((id): id is number => id != null && Number.isInteger(id) && id > 0),
  )

  for (const r of current) {
    if (!formIds.has(r.id)) {
      await deleteCustomerCar(token, customerId, r.id)
    }
  }

  const afterDelete = await listCustomerCars(token, customerId)
  const freshById = new Map(afterDelete.map((r) => [r.id, r]))

  for (let i = 0; i < norm.length; i += 1) {
    const car = norm[i]
    const isPrimary = i === pIdx
    if (car.id != null && freshById.has(car.id)) {
      const rec = freshById.get(car.id)!
      if (!recordEqualsForm(rec, car, isPrimary)) {
        await updateCustomerCar(token, customerId, car.id, formItemToInput(car, isPrimary))
      }
      continue
    }
    await createCustomerCar(token, customerId, formItemToInput(car, isPrimary))
  }
}
