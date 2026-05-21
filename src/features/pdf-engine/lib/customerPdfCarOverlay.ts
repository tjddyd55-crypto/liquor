import type { CustomerCarRecord } from '../../customers/api/customerCarsApi'
import type { CustomerRecord } from '../../customers/domain/types'

/** 다중 차량 선택 시: 차량 전용 필드만 선택 차량(또는 미선택 시 빈 문자열)으로 덮어 PDF 입력용 CustomerRecord 를 만든다. */
export function customerWithSelectedCar(
  customer: CustomerRecord,
  car: CustomerCarRecord | null,
): CustomerRecord {
  if (!car) {
    return {
      ...customer,
      carNumber: '',
      carModel: '',
      carYear: '',
      renewalDate: '',
      carType: '',
    }
  }
  const rd = car.renewalDate ? String(car.renewalDate).slice(0, 10) : ''
  return {
    ...customer,
    carNumber: (car.carNumber ?? '').trim(),
    carModel: (car.carModel ?? '').trim(),
    carYear: (car.carYear ?? '').trim(),
    renewalDate: rd,
    carType: (car.carType ?? '').trim(),
  }
}

export function sortCustomerCarsForPicker(cars: CustomerCarRecord[]): CustomerCarRecord[] {
  return [...cars].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) {
      return a.isPrimary ? -1 : 1
    }
    if (a.sortOrder !== b.sortOrder) {
      return a.sortOrder - b.sortOrder
    }
    return a.id - b.id
  })
}
