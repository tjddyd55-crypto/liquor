import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type TransitionEvent,
} from 'react'

/** index.css `.customers-page .customer-expand-detail` — `transition` 의 opacity/transform 구간(ms) */
export const EXPANDABLE_CARD_TRANSITION_MS = 160

/**
 * 닫힘 fallback 타이머(ms). CSS transition(0.2s)보다 충분히 길게 유지.
 * CSS의 transition 길이를 바꾸면 `EXPANDABLE_CARD_TRANSITION_MS`·이 값을 함께 맞출 것.
 */
export const CLOSE_DURATION = 220

/** 훅에 넘길 수 없는 카드일 때(렌더 가드용) — 토글·닫힘 처리 전부 무시 */
export const EXPANDABLE_CARD_INVALID_ID = -1 as const

export type UseExpandableCardOptions = {
  cardId: number
  expandedId: number | null
  setExpandedId: Dispatch<SetStateAction<number | null>>
  /** 호환용(미사용). 멀티 선택 모드에서도 펼침 토글은 허용한다. */
  interactionDisabled?: boolean
}

export type UseExpandableCardResult = {
  expanded: boolean
  detailClosing: boolean
  showExpandedChrome: boolean
  toggleExpanded: () => void
  handleDetailTransitionEnd: (e: TransitionEvent<HTMLDivElement>) => void
}

/**
 * 리스트 카드 한 장 기준: `expandedId` 단일 원천 + 닫힘 애니메이션 동기화.
 *
 * 닫힘 처리:
 * - transitionend 우선 (`opacity` / `transform`)
 * - fallback timeout (`CLOSE_DURATION`)
 * - ref로 중복 방지 (`closingCardIdRef` + `finishCloseDetail` 가드)
 */
export function useExpandableCard({
  cardId,
  expandedId,
  setExpandedId,
}: UseExpandableCardOptions): UseExpandableCardResult {
  const [detailClosing, setDetailClosing] = useState(false)
  const closingCardIdRef = useRef<number | null>(null)

  const isValidCard = cardId !== EXPANDABLE_CARD_INVALID_ID
  const expanded = isValidCard && expandedId === cardId

  useEffect(() => {
    if (!expanded) {
      closingCardIdRef.current = null
      queueMicrotask(() => {
        setDetailClosing(false)
      })
    }
  }, [expanded])

  const finishCloseDetail = useCallback(() => {
    if (!isValidCard || closingCardIdRef.current !== cardId) {
      return
    }
    closingCardIdRef.current = null
    setExpandedId(() => null)
    setDetailClosing(false)
  }, [cardId, isValidCard, setExpandedId])

  const toggleExpanded = useCallback(() => {
    if (!isValidCard) {
      return
    }
    if (detailClosing) {
      return
    }
    if (expandedId === cardId) {
      closingCardIdRef.current = cardId
      setDetailClosing(true)
      return
    }
    closingCardIdRef.current = null
    setDetailClosing(false)
    setExpandedId(() => cardId)
  }, [cardId, detailClosing, expandedId, isValidCard, setExpandedId])

  const handleDetailTransitionEnd = useCallback(
    (e: TransitionEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) {
        return
      }
      const p = e.propertyName
      if (p !== 'opacity' && p !== 'transform') {
        return
      }
      finishCloseDetail()
    },
    [finishCloseDetail],
  )

  useEffect(() => {
    if (!detailClosing || closingCardIdRef.current !== cardId || !isValidCard) {
      return
    }
    const closingForId = cardId
    const tid = window.setTimeout(() => {
      if (closingCardIdRef.current !== closingForId) {
        return
      }
      finishCloseDetail()
    }, CLOSE_DURATION)
    return () => window.clearTimeout(tid)
  }, [cardId, detailClosing, finishCloseDetail, isValidCard])

  const showExpandedChrome = expanded && !detailClosing

  return {
    expanded,
    detailClosing,
    showExpandedChrome,
    toggleExpanded,
    handleDetailTransitionEnd,
  }
}
