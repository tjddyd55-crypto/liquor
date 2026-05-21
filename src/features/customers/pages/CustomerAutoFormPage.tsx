import { ApplicationFormPage } from '../../application/pages/ApplicationFormPage'

/**
 * 고객 작업공간 우측에서 "자동차 신청서" 를 **URL 기반**으로 렌더링하기 위한 래퍼.
 *
 * 설계 배경(routing-ssot.mdc 1, 2 조항):
 *   과거에는 `CustomerWorkspaceLayout` 이 `rightPanelCarForm` 로컬 state 로
 *   자동차 신청서 표시 여부를 토글했다. 그러나 다른 우측 메뉴(파일/상담/GA/메모)는
 *   URL path 로 전환되므로 "로컬 state" 와 "URL path" 두 개의 단일 진실 원천이
 *   공존하는 혼합 구조가 되었고, 사용 순서에 따라 `activeTab` 계산과 실제 렌더
 *   결과가 어긋나는 회귀가 반복해 발생했다.
 *
 *   해결 방향은 "우측 패널은 오로지 URL 기준으로 렌더"  한 가지다.
 *   그 약속을 지키기 위해 자동차 신청서도 `/customers/:customerId/auto-form` 으로
 *   올리고, layout 은 <Outlet/> 만 렌더하도록 단순화한다.
 *
 * 스타일:
 *   기존 UI 는 `customer-workspace-layout__embedded-car*` 클래스 스코프 안에서
 *   폼을 렌더하는 것을 전제로 스타일이 짜여 있다. 시각적 회귀를 막기 위해
 *   같은 컨테이너 구조를 유지한다.
 */
export default function CustomerAutoFormPage() {
  return (
    <div
      className="customer-workspace-layout__embedded-car"
      role="region"
      aria-label="자동차 신청서 작성"
    >
      <div className="customer-workspace-layout__embedded-car-body">
        <ApplicationFormPage />
      </div>
    </div>
  )
}
