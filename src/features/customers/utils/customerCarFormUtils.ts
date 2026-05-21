import type { CustomerRecord } from '../domain/types'
import type { CustomerCarFormItem } from '../types/customerCarForm'

export function createEmptyCustomerCar(): CustomerCarFormItem {
  return {
    carNumber: '',
    carModel: '',
    carYear: '',
    renewalDate: '',
    isPrimary: false,
  }
}

export function isCustomerCarEmpty(car: CustomerCarFormItem): boolean {
  const t = (s: string | undefined) => String(s ?? '').trim()
  return (
    !t(car.carNumber) &&
    !t(car.carModel) &&
    !t(car.carYear) &&
    !t(car.renewalDate) &&
    !t(car.carType) &&
    !t(car.memo)
  )
}

export function normalizeCustomerCarsForSave(cars: CustomerCarFormItem[]): CustomerCarFormItem[] {
  return cars.filter((c) => !isCustomerCarEmpty(c))
}

export function pickPrimaryCustomerCar(cars: CustomerCarFormItem[]): CustomerCarFormItem | null {
  if (!cars.length) {
    return null
  }
  const primary = cars.find((c) => c.isPrimary === true)
  if (primary) {
    return primary
  }
  const firstNonEmpty = cars.find((c) => !isCustomerCarEmpty(c))
  return firstNonEmpty ?? cars[0] ?? null
}

export function customerRecordToCarFormItems(customer: CustomerRecord): CustomerCarFormItem[] {
  return [
    {
      carNumber: customer.carNumber ?? '',
      carModel: customer.carModel ?? '',
      carYear: customer.carYear ?? '',
      renewalDate: customer.renewalDate ?? '',
      isPrimary: true,
    },
  ]
}

/** 상세 보기용 — 레거시 단일 차량이 비어 있으면 빈 배열 */
export function customerRecordToCarFormItemsForDisplay(
  customer: CustomerRecord,
): CustomerCarFormItem[] {
  const items = customerRecordToCarFormItems(customer)
  return items.filter((car) => !isCustomerCarEmpty(car))
}
