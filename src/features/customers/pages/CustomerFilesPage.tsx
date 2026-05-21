import { Link, useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { useAuth } from '../../auth/AuthProvider'
import CustomerFilesPagePC from './detail/CustomerFilesPagePC'

type CustomerFilesViewProps = {
  token: string
  customerId: number
}

function CustomerFilesPCView({ token, customerId }: CustomerFilesViewProps) {
  return <CustomerFilesPagePC token={token} customerId={customerId} variant="pc" />
}

function CustomerFilesMobileView({ token, customerId }: CustomerFilesViewProps) {
  return <CustomerFilesPagePC token={token} customerId={customerId} variant="mobile" />
}

export default function CustomerFilesPage() {
  const { customerId: customerIdParam } = useParams<{ customerId: string }>()
  const { user, token } = useAuth()

  const customerId = Number(customerIdParam)
  const validId = Number.isInteger(customerId) && customerId > 0

  if (user?.role !== 'USER' && user?.role !== 'GA_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <p className="customers-page__denied">접근 권한 없음</p>
        </header>
      </main>
    )
  }

  if (!validId || !token?.trim()) {
    return (
      <div className="page-shell storage-customer-page">
        <p>{validId ? '로그인이 필요합니다.' : '잘못된 고객 ID입니다.'}</p>
        <Link to="/customers" className="underline text-[var(--link,#60a5fa)]">
          고객 목록으로
        </Link>
      </div>
    )
  }

  return (
    <ResponsiveLayout<CustomerFilesViewProps>
      PC={CustomerFilesPCView}
      Mobile={CustomerFilesMobileView}
      viewProps={{ token, customerId }}
    />
  )
}
