import type { CustomerRecord } from '../domain/types'
import { CustomerCarsReadGrid } from './CustomerCarsReadGrid'
import { useCustomerCars } from '../hooks/useCustomerCars'
import { customerCarRecordToFormItem } from '../utils/customerCarsSaveUtils'
import { customerRecordToCarFormItemsForDisplay } from '../utils/customerCarFormUtils'
import type { CustomerCarFormItem } from '../types/customerCarForm'

export type CustomerCarsReadSectionProps = {
  customer: CustomerRecord
  token: string | null
  enabled: boolean
}

export function CustomerCarsReadSection({ customer, token, enabled }: CustomerCarsReadSectionProps) {
  const shouldFetch = Boolean(enabled && token?.trim())
  const { cars, isLoading, errorMessage } = useCustomerCars({
    token,
    customerId: customer.id,
    enabled: shouldFetch,
  })

  const fallback: CustomerCarFormItem[] = customerRecordToCarFormItemsForDisplay(customer)

  let displayCars: CustomerCarFormItem[] = fallback
  let showApiWarning = false

  if (shouldFetch) {
    if (errorMessage) {
      displayCars = fallback
      showApiWarning = true
    } else if (!isLoading) {
      displayCars = cars.length > 0 ? cars.map(customerCarRecordToFormItem) : fallback
    } else {
      displayCars = []
    }
  }

  return (
    <div className="customer-detail-read__cars-wrap">
      {showApiWarning ? (
        <p className="customer-detail-read__api-warn" role="status">
          자동차 목록을 불러오지 못해 저장된 기본 정보로 표시합니다.
        </p>
      ) : null}
      <CustomerCarsReadGrid cars={displayCars} loading={shouldFetch && isLoading} />
    </div>
  )
}
