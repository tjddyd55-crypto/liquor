import type { NewsChannel, NewsletterItem } from '../../types'

/**
 * `InsurerManagerNewsListPCView` / `InsurerManagerNewsListMobileView` 가 공유하는
 * View props 시그니처.
 *
 * ## 설계 메모
 *
 *  - Container 는 오로지 "데이터 로딩 + 가드 + 분기" 만 책임진다.
 *    상세 조회·모달·줌 같은 PC 전용 상태는 PC View 내부에서 관리한다
 *    (Mobile 은 라우트 이동만 해 상세 조회 없음). → Mobile 번들에 불필요한 state·
 *    fetch 로직이 포함되지 않게 한다.
 *
 *  - 두 View 모두 아래 prop 을 받는 것이 `ResponsiveLayout<ViewProps>` 의 전제다.
 *    Mobile 이 실제로 `channel` / `fetchScope` 를 사용하지는 않지만, 향후 모바일이
 *    인라인 상세를 지원하게 되거나 navigate 대신 in-place 로딩이 필요해질 때
 *    시그니처 변경 없이 확장 가능하도록 공통에 남긴다.
 *
 *  - `openPathPrefix` 는 Mobile 이 `navigate(\`${openPathPrefix}/${id}\`)` 에 사용.
 *    PC 는 인라인 모달이라 사용하지 않지만 역시 공통에 둔다 (대칭성).
 */
export type InsurerManagerNewsListViewProps = {
  items: NewsletterItem[]
  error: string
  title: string
  subtitle: string
  emptyMessage: string
  /** Mobile 에서 아이템 클릭 시 이동할 라우트 prefix (예: `/insurer/news`). */
  openPathPrefix: string
  /** 상세 조회 API 에 넘길 채널 (INSURER / LOSS_ADJUSTER 등). PC 가 사용. */
  channel: NewsChannel
  /** 'manager' | 'ga' — 상세 API 라우팅 스위치. PC 가 사용. */
  fetchScope: 'manager' | 'ga'
}
