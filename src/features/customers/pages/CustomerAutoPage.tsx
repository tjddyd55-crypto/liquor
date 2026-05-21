import { useParams } from 'react-router-dom'
import { ApplicationFormPage } from '../../application/pages/ApplicationFormPage'

export default function CustomerAutoPage() {
  const { customerId } = useParams()
  const parsedCustomerId = Number(customerId)
  const isValidCustomerId = Number.isInteger(parsedCustomerId) && parsedCustomerId > 0

  if (!isValidCustomerId) {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <p className="customers-page__denied">잘못된 고객 ID입니다.</p>
        </header>
      </main>
    )
  }

  return <ApplicationFormPage />
}
