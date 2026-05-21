import type { ReactNode } from 'react'
import ClaimRequestsPageMobileView from './ClaimRequestsPageMobileView'

type ClaimRequestsClaimsMobileLayoutProps = {
  /** 고객 워크스페이스 등에서 생략 시 상단 레거시 링크/연결 카드를 렌더하지 않음 */
  linkSection?: ReactNode
  connectionSection?: ReactNode
  requestListSection: ReactNode
  detailModal: ReactNode
}

export default function ClaimRequestsClaimsMobileLayout({
  linkSection,
  connectionSection,
  requestListSection,
  detailModal,
}: ClaimRequestsClaimsMobileLayoutProps) {
  return (
    <ClaimRequestsPageMobileView
      linkSection={linkSection}
      connectionSection={connectionSection}
      requestListSection={requestListSection}
      detailModal={detailModal}
    />
  )
}
