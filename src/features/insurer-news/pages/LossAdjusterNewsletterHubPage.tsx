import { NewsletterHubPage } from './NewsletterHubPage'

export function LossAdjusterNewsletterHubPage() {
  return (
    <NewsletterHubPage
      channel="LOSS_ADJUSTER"
      title="손해사정사 뉴스 조회"
      subtitle="등록된 손해사정사 뉴스를 확인할 수 있습니다."
      detailBasePath="/portal/adjuster-news"
      emptyMessage="등록된 손해사정사 뉴스가 없습니다."
      noSessionMessage="GA에 소속된 계정으로 로그인한 후 이용할 수 있습니다."
    />
  )
}
