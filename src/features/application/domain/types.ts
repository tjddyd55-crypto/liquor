import type {
  CONTRACT_TYPES,
  DRIVER_AGE_OPTIONS,
  DRIVER_SCOPE_OPTIONS,
  EMERGENCY_ASSIST_OPTIONS,
  OWN_VEHICLE_DAMAGE_OPTIONS,
  PERSONAL_INJURY_OPTIONS,
  PREVIOUS_INSURERS,
  PROPERTY_DAMAGE_OPTIONS,
  UNINSURED_MOTORIST_OPTIONS,
  USAGE_TYPES,
  YES_NO_OPTIONS,
} from './options'

type OptionValue<T extends readonly string[]> = T[number]

export type ContractType = OptionValue<typeof CONTRACT_TYPES> | ''
export type UsageType = OptionValue<typeof USAGE_TYPES> | ''
export type PreviousInsurer = OptionValue<typeof PREVIOUS_INSURERS> | ''
export type YesNoOption = OptionValue<typeof YES_NO_OPTIONS> | ''
export type PropertyDamageOption = OptionValue<typeof PROPERTY_DAMAGE_OPTIONS> | ''
export type PersonalInjuryOption = OptionValue<typeof PERSONAL_INJURY_OPTIONS> | ''
export type UninsuredMotoristOption = OptionValue<typeof UNINSURED_MOTORIST_OPTIONS> | ''
export type OwnVehicleDamageOption = OptionValue<typeof OWN_VEHICLE_DAMAGE_OPTIONS> | ''
export type EmergencyAssistOption = OptionValue<typeof EMERGENCY_ASSIST_OPTIONS> | ''
export type DriverScopeOption = OptionValue<typeof DRIVER_SCOPE_OPTIONS> | ''
export type DriverAgeOption = OptionValue<typeof DRIVER_AGE_OPTIONS> | ''

export interface InsuranceApplicationFormData {
  branchName: string
  staffName: string
  expiryDate: string
  contractType: ContractType
  usageType: UsageType
  previousInsurer: PreviousInsurer
  ownerName: string
  ownerPhone: string
  ownerResidentNumber: string
  ownerAddress: string
  /** 통신사·카톡 복사용(고객 DB carrier와 동일) */
  carrier: string
  height: string
  weight: string
  job: string
  driving: string
  medical: string
  payerSameAsOwner: boolean
  payerName: string
  payerPhone: string
  payerResidentNumber: string
  payerAddress: string
  vehicleNumber: string
  vehicleModel: string
  vehicleYear: string
  mileageYn: YesNoOption
  blackboxYn: YesNoOption
  bankAccount: string
  extraAccessories: string
  propertyDamage: PropertyDamageOption
  personalInjury: PersonalInjuryOption
  uninsuredMotorist: UninsuredMotoristOption
  ownVehicleDamage: OwnVehicleDamageOption
  emergencyAssist: EmergencyAssistOption
  driverScope: DriverScopeOption
  driverAge: DriverAgeOption
  designatedDriverName: string
  designatedDriverResidentNumber: string
  spouseOrMinDriverName: string
  spouseOrMinDriverResidentNumber: string
  career1: string
  career2: string
  memo: string
  /** DB 고객 행과 연결. 0이면 미연결 */
  customerId: number
}

export interface InsuranceApplicationRecord extends InsuranceApplicationFormData {
  id: string
  userId?: string
  customerName?: string
  carNumber?: string
  title: string
  createdAt: string
  updatedAt: string
}
