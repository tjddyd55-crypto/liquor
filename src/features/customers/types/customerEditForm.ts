import type { CustomerCarFormItem } from './customerCarForm'

export type CustomerEditFormState = {
  name: string
  gender: 'male' | 'female' | null
  ssn: string
  phone: string
  carrier: string
  birthDate: string
  address: string
  addressDetail: string
  zonecode: string
  height: string
  weight: string
  job: string
  isDriver: boolean | null
  /** UI 제거 — 서버 `customers.car_type` 유지용(기존 값 보존) */
  carType: string
  medical: string
  insuranceHistory: string
  cars: CustomerCarFormItem[]
  crmExtensionFields: Record<string, string>
}