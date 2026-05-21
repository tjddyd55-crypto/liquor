import { Children, cloneElement, isValidElement } from 'react'
import type { ReactElement, ReactNode } from 'react'

type ClaimRequestsPageMobileViewSlots = {
  /** 링크 생성/재전송, 문자/카카오/미리보기 버튼 영역 */
  linkSection?: ReactNode
  /** 고객앱 연결 상태 영역 */
  connectionSection?: ReactNode
  /** 청구 요청 목록 영역 */
  requestListSection?: ReactNode
  /** 전체소식지/개인메시지 등 claim 이외 탭 전용 메인 영역 */
  contentSection?: ReactNode
  /** 모바일 전체화면 상세 모달 */
  detailModal?: ReactNode
}

type ClaimRequestsPageMobileViewProps = ClaimRequestsPageMobileViewSlots & {
  /**
   * 기존 ClaimRequestsPage.tsx가 아직 children 방식으로 넘기고 있으므로
   * 마이그레이션 기간 동안만 허용한다.
   *
   * 최종 구조는 children 필터링이 아니라 위 slot props만 사용하는 방식이다.
   */
  children?: ReactNode
}

const INLINE_DETAIL_TITLE = '선택한 청구 요청 상세'
const RAW_LINK_FIELD_TITLES = ['연결 코드', '연결 URL']
const PROTECTED_SECTION_TITLES = ['링크 발송', '연결 상태', '청구 요청 목록']
const PROTECTED_LINK_ACTION_TITLES = ['링크 발송', '문자 발송', '카카오 발송', '링크 미리보기']

function nodeContainsText(node: ReactNode, target: string): boolean {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node).includes(target)
  }

  if (Array.isArray(node)) {
    return node.some((child) => nodeContainsText(child, target))
  }

  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeContainsText(node.props.children, target)
  }

  return false
}

function nodeContainsAnyText(node: ReactNode, targets: string[]): boolean {
  return targets.some((target) => nodeContainsText(node, target))
}

function shouldRemoveInlineDetail(node: ReactElement<{ children?: ReactNode }>): boolean {
  if (!nodeContainsText(node, INLINE_DETAIL_TITLE)) {
    return false
  }

  return !PROTECTED_SECTION_TITLES.some((title) => nodeContainsText(node, title))
}

function shouldRemoveRawLinkField(node: ReactElement<{ children?: ReactNode }>): boolean {
  if (!nodeContainsAnyText(node, RAW_LINK_FIELD_TITLES)) {
    return false
  }

  // 링크 발송 카드/헤더/공유 액션은 유지하고 내부 원문 필드만 계속 내려가며 제거한다.
  if (nodeContainsAnyText(node, PROTECTED_LINK_ACTION_TITLES)) {
    return false
  }

  return true
}

function shouldInspectChildren(node: ReactElement<{ children?: ReactNode }>): boolean {
  return nodeContainsText(node, INLINE_DETAIL_TITLE) || nodeContainsAnyText(node, RAW_LINK_FIELD_TITLES)
}

/**
 * 임시 호환 어댑터.
 *
 * 정석 구조는 ClaimRequestsPage.tsx에서 모바일에 필요한 slot만 넘기는 것이다.
 * 이 함수는 parent 마이그레이션 전까지 기존 화면을 유지하기 위한 호환층이며,
 * 신규 모바일 화면에서는 사용하지 않는다.
 */
function filterLegacyMobileChildren(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    return node.map(filterLegacyMobileChildren).filter(Boolean)
  }

  if (!isValidElement<{ children?: ReactNode }>(node)) {
    return node
  }

  if (shouldRemoveInlineDetail(node) || shouldRemoveRawLinkField(node)) {
    return null
  }

  if (!shouldInspectChildren(node)) {
    return node
  }

  return cloneElement(node, {
    children: filterLegacyMobileChildren(node.props.children),
  })
}

function hasSlotContent(props: ClaimRequestsPageMobileViewSlots): boolean {
  return Boolean(
    props.linkSection ||
      props.connectionSection ||
      props.requestListSection ||
      props.contentSection ||
      props.detailModal,
  )
}

export default function ClaimRequestsPageMobileView(props: ClaimRequestsPageMobileViewProps) {
  const slotMode = hasSlotContent(props)

  return (
    <main className="page claim-requests-page claim-requests-page--mobile page--with-back content-wrapper space-y-4">
      {slotMode ? (
        <>
          {props.linkSection}
          {props.connectionSection}
          {props.requestListSection}
          {props.contentSection}
          {props.detailModal}
        </>
      ) : (
        filterLegacyMobileChildren(Children.toArray(props.children))
      )}
    </main>
  )
}
