import { InsurerManagerNewsUploadPage } from './InsurerManagerNewsUploadPage'

export function LossAdjusterManagerNewsUploadPage() {
  return (
    <InsurerManagerNewsUploadPage
      channel="LOSS_ADJUSTER"
      title="손해사정사 뉴스 업로드"
      subtitle="등록된 내용은 GA 소속 사용자에게 공개될 수 있습니다."
      listPath="/adjuster/news"
      noSessionMessage="손해사정사 계정으로 로그인한 후 이용할 수 있습니다."
    />
  )
}
