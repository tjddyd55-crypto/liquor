import { ApiError, apiRequest } from '../../../lib/apiClient'

export type CustomerCarRecord = {
  id: number
  customerId: number
  carType: string
  carNumber: string
  carModel: string
  carYear: string
  renewalDate: string | null
  memo: string
  isPrimary: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CustomerCarInput = {
  carType?: string
  carNumber: string
  carModel: string
  carYear: string
  renewalDate: string
  memo?: string
  isPrimary?: boolean
}

function assertToken(token: string): void {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
}

function mapCar(raw: Record<string, unknown>): CustomerCarRecord {
  return {
    id: Number(raw.id),
    customerId: Number(raw.customerId),
    carType: String(raw.carType ?? ''),
    carNumber: String(raw.carNumber ?? ''),
    carModel: String(raw.carModel ?? ''),
    carYear: String(raw.carYear ?? ''),
    renewalDate: raw.renewalDate == null || raw.renewalDate === '' ? null : String(raw.renewalDate),
    memo: String(raw.memo ?? ''),
    isPrimary: raw.isPrimary === true,
    sortOrder: Number(raw.sortOrder ?? 0),
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

export async function listCustomerCars(token: string, customerId: number): Promise<CustomerCarRecord[]> {
  assertToken(token)
  if (!Number.isInteger(customerId) || customerId < 1) {
    throw new ApiError('고객 id가 유효하지 않습니다.', 400)
  }
  const raw = await apiRequest<unknown>(`/api/customers/${customerId}/cars`, { method: 'GET', token })
  if (!raw || typeof raw !== 'object') {
    return []
  }
  const cars = (raw as { cars?: unknown }).cars
  if (!Array.isArray(cars)) {
    return []
  }
  return cars.map((c) => mapCar(c as Record<string, unknown>))
}

export async function createCustomerCar(
  token: string,
  customerId: number,
  payload: CustomerCarInput,
): Promise<CustomerCarRecord> {
  assertToken(token)
  const raw = await apiRequest<unknown>(`/api/customers/${customerId}/cars`, {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('자동차 등록 응답이 올바르지 않습니다.', 502)
  }
  return mapCar(raw as Record<string, unknown>)
}

export async function updateCustomerCar(
  token: string,
  customerId: number,
  carId: number,
  payload: Partial<CustomerCarInput>,
): Promise<CustomerCarRecord> {
  assertToken(token)
  const raw = await apiRequest<unknown>(`/api/customers/${customerId}/cars/${carId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('자동차 수정 응답이 올바르지 않습니다.', 502)
  }
  return mapCar(raw as Record<string, unknown>)
}

export async function deleteCustomerCar(token: string, customerId: number, carId: number): Promise<void> {
  assertToken(token)
  await apiRequest<unknown>(`/api/customers/${customerId}/cars/${carId}`, {
    method: 'DELETE',
    token,
  })
}
