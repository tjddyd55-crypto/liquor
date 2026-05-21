import type { MutableRefObject } from 'react'
import CustomersPage from '../CustomersPage'

export type CustomersPageContainerProps = {
  openRelatedCustomerRef?: MutableRefObject<
    ((customerId: number, customerName?: string) => void) | null
  >
}

export default function CustomersPageContainer({
  openRelatedCustomerRef,
}: CustomersPageContainerProps = {}) {
  return <CustomersPage openRelatedCustomerRef={openRelatedCustomerRef} />
}
