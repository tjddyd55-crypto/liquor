import { useParams, useSearchParams } from 'react-router-dom'
import useIsMobile from '../../../hooks/useIsMobile'
import ClaimRequestsAllNewsMobileStandalone from './claim-requests/ClaimRequestsAllNewsMobileStandalone'
import ClaimRequestsAllNewsPCStandalone from './claim-requests/ClaimRequestsAllNewsPCStandalone'
import ClaimRequestsClaimsMobileStandalone from './claim-requests/ClaimRequestsClaimsMobileStandalone'
import ClaimRequestsPersonalMobileStandalone from './claim-requests/ClaimRequestsPersonalMobileStandalone'
import ClaimRequestsPersonalPCStandalone from './claim-requests/ClaimRequestsPersonalPCStandalone'
import ClaimInboxPage from './ClaimInboxPage'
import ClaimRequestsPage from './ClaimRequestsPage'

export default function ClaimRequestsRoutePage() {
  const isMobile = useIsMobile()
  const { customerId } = useParams<{ customerId?: string }>()
  const [searchParams] = useSearchParams()
  const claimTabParam = searchParams.get('claimTab')
  const hasCustomerContext = Boolean(customerId?.trim())
  const isInboxTab =
    !hasCustomerContext && (!claimTabParam || claimTabParam === 'inbox' || claimTabParam === 'claims')
  const isClaimsTab = hasCustomerContext && (!claimTabParam || claimTabParam === 'claims')
  const isPersonalTab = claimTabParam === 'news-personal'
  const isAllNewsTab = claimTabParam === 'news-all'

  if (isInboxTab) {
    return <ClaimInboxPage />
  }

  if (isMobile && isClaimsTab) {
    return <ClaimRequestsClaimsMobileStandalone />
  }

  if (isMobile && isPersonalTab) {
    return <ClaimRequestsPersonalMobileStandalone />
  }

  if (!isMobile && isPersonalTab && hasCustomerContext) {
    return <ClaimRequestsPersonalPCStandalone />
  }

  if (!isMobile && isAllNewsTab) {
    return <ClaimRequestsAllNewsPCStandalone />
  }

  if (isMobile && isAllNewsTab) {
    return <ClaimRequestsAllNewsMobileStandalone />
  }

  if (!isMobile && isAllNewsTab && hasCustomerContext) {
    return <ClaimRequestsAllNewsPCStandalone />
  }

  return <ClaimRequestsPage />
}
