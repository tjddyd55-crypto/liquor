import type { CustomerConsultationRow } from '../api/customerExtraApi'
import CustomerConsultationsModal from './mobile/CustomerConsultationsModal'
import CustomerFilesModal from './mobile/CustomerFilesModal'
import CustomerGaDataModal from './mobile/CustomerGaDataModal'

export type CustomerMobileModalsProps = {
  isMobile: boolean
  activeMobileModal: null | 'files' | 'consultations' | 'ga'
  activeMobileCustomerId: number | null
  closeMobileModal: () => void
  handleCustomerConsultationCreated: (
    customerId: number,
    row: Pick<CustomerConsultationRow, 'consultationDate' | 'createdAt'>,
  ) => void
}

export default function CustomerMobileModals({
  isMobile,
  activeMobileModal,
  activeMobileCustomerId,
  closeMobileModal,
  handleCustomerConsultationCreated,
}: CustomerMobileModalsProps) {
  if (!isMobile || activeMobileCustomerId == null) {
    return null
  }

  return (
    <>
      {activeMobileModal === 'files' ? (
        <CustomerFilesModal customerId={activeMobileCustomerId} onClose={closeMobileModal} />
      ) : null}
      {activeMobileModal === 'consultations' ? (
        <CustomerConsultationsModal
          customerId={activeMobileCustomerId}
          onCreated={(row) => handleCustomerConsultationCreated(activeMobileCustomerId, row)}
          onClose={closeMobileModal}
        />
      ) : null}
      {activeMobileModal === 'ga' ? (
        <CustomerGaDataModal customerId={activeMobileCustomerId} onClose={closeMobileModal} />
      ) : null}
    </>
  )
}
