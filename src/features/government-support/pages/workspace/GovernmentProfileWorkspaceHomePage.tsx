import { useOutletContext } from 'react-router-dom'
import { useGovernmentProfileWorkspaceContext } from './governmentProfileWorkspaceContext'

type OutletContext = {
  selectedProfileId: string | null
}

export default function GovernmentProfileWorkspaceHomePage() {
  const { selectedProfileId } = useOutletContext<OutletContext>()
  const ws = useGovernmentProfileWorkspaceContext()

  return (
    <section className="customer-workspace-home customer-workspace-home--landing">
      <div className="customer-workspace-home__intro">
        <h3 className="customer-workspace-home__title">사업장 작업영역</h3>
        <p className="customer-workspace-home__desc">
          좌측 목록에서 사업장을 선택한 뒤, 상단 버튼으로 서류/상담/메모/진행/전자서명 작업을 진행하세요.
        </p>
        <p className="customer-workspace-home__selected">
          현재 선택: {selectedProfileId ? selectedProfileId.slice(0, 8) : '없음'}
          {ws.profiles.length > 0 ? ` · 등록 ${ws.profiles.length}건` : null}
        </p>
      </div>
    </section>
  )
}
