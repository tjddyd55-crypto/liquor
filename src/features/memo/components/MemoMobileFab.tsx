import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { FormButton } from '../../../components/form'
import {
  clampFabBottomDvh,
  loadFabBottomDvh,
  saveFabBottomDvh,
} from '../memoFabPosition'

/**
 * 모바일 전용 메모 진입 FAB(Floating Action Button).
 *
 * ## 위치 정책
 *
 * - 가로: 화면 우측 가장자리(오른쪽 16px 여백). 좌우 이동은 지원하지 않는다.
 * - 세로: 사용자가 드래그로 위/아래 이동. 저장/복원은 `memoFabPosition` 이 SSOT.
 *   초기 기본값은 `FAB_DEFAULT_BOTTOM_DVH`(하단 1/3 지점, 오른손 엄지 기준).
 *
 * ## 왜 FAB 단일 진입인가
 *
 *  - 메뉴/드로어에 메모 항목을 두면 "햄버거 → 스크롤 → 탭" 이라는 3 스텝이 필요.
 *  - 메모는 "지금 이 화면에서 떠오른 생각을 즉시 적는다" 가 핵심 UX 라 상시 한 번
 *    터치로 닿아야 한다. FAB 는 이 요구에 가장 맞는 UI 패턴.
 *
 * ## 탭 vs 드래그
 *
 *  - 포인터 이동이 `DRAG_THRESHOLD_PX` 를 넘기 전엔 "탭" 으로 간주 → `onClick` 으로 `/memo` 이동.
 *  - 임계치를 넘으면 "드래그" 로 잠기고, 손뗀 뒤 `justDraggedRef` 로 직후 click 을 1회 취소.
 *  - 키보드(Enter/Space) 는 `onClick` 만 발생 → 평소처럼 진입 가능 (접근성 유지).
 *
 * ## 저장
 *
 *  - 손을 뗄 때만 1회 저장(드래그 중 빈번한 I/O 없음).
 *  - dvh 비율로 저장 → 기기 해상도가 달라져도 같은 상대 위치로 복원된다.
 *
 * ## 렌더 지점
 *
 *  - 모바일 최상위 레이아웃(`AppWorkspaceLayoutMobileShell`) 에 한 번만 렌더.
 *  - `/memo` 경로에서는 자기 자신을 숨긴다(중복 진입 의미 없음).
 */

const DRAG_THRESHOLD_PX = 8

export function MemoMobileFab() {
  const navigate = useNavigate()
  const location = useLocation()

  const [bottomDvh, setBottomDvh] = useState<number>(() => loadFabBottomDvh())
  const [isDragging, setIsDragging] = useState(false)

  const dragRef = useRef<{
    startY: number
    startBottomDvh: number
    moved: boolean
  } | null>(null)
  // pointerup 직후 발생하는 click(=네이티브 컴포지트 이벤트) 을 1회 취소하기 위한 플래그.
  // 드래그 종료 시 true → 이어지는 onClick 에서 navigate 를 건너뛰고 false 로 리셋한다.
  const justDraggedRef = useRef(false)

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* 일부 환경에서 지원 안 됨 — 캡처 없이도 pointermove 는 동일 엘리먼트에서 발생 */
      }
      dragRef.current = { startY: e.clientY, startBottomDvh: bottomDvh, moved: false }
    },
    [bottomDvh],
  )

  const onPointerMove = useCallback((e: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag) {
      return
    }
    const dy = e.clientY - drag.startY
    if (!drag.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) {
      return
    }
    drag.moved = true
    setIsDragging(true)
    // 포인터를 위로 올리면 clientY 감소 → FAB bottom 은 증가.
    const viewportPx = window.innerHeight || 1
    const deltaDvh = (-dy / viewportPx) * 100
    setBottomDvh(clampFabBottomDvh(drag.startBottomDvh + deltaDvh))
  }, [])

  const onPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      const drag = dragRef.current
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* 이미 해제 — 무시 */
      }
      if (!drag || !drag.moved) {
        return
      }
      setIsDragging(false)
      justDraggedRef.current = true
      saveFabBottomDvh(bottomDvh)
    },
    [bottomDvh],
  )

  const onPointerCancel = useCallback(() => {
    setIsDragging(false)
    dragRef.current = null
  }, [])

  const onClick = useCallback(() => {
    if (justDraggedRef.current) {
      justDraggedRef.current = false
      return
    }
    navigate('/memo')
  }, [navigate])

  if (location.pathname === '/memo' || location.pathname.startsWith('/memo/')) {
    return null
  }

  return (
    <FormButton
      htmlType="button"
      aria-label="메모 — 탭하면 열기, 위아래로 드래그하면 위치 이동"
      className={`memo-mobile-fab${isDragging ? ' memo-mobile-fab--dragging' : ''}`}
      style={{ bottom: `${bottomDvh}dvh` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={onClick}
    >
      메모
    </FormButton>
  )
}

export default MemoMobileFab
