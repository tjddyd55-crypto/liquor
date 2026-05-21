import type { ReactNode } from 'react'

type ClaimRequestsPagePCViewProps = {
  children: ReactNode
}

export default function ClaimRequestsPagePCView({ children }: ClaimRequestsPagePCViewProps) {
  return <main className="page claim-requests-page claim-requests-page--pc page--with-back content-wrapper">{children}</main>
}

