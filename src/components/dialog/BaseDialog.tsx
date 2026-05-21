import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type BaseDialogProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  ariaLabel?: string
  panelClassName?: string
  overlayClassName?: string
  initialFocusRef?: React.RefObject<HTMLElement | null>
  /**
   * 기본 true. 입력·작성·수정 모달에서는 false 로 두고, Escape 는 필요 시 `onEscapeRequest` 로
   * 미저장 확인을 거친다(AGENTS.md 모달 UX 규칙).
   */
  closeOnBackdrop?: boolean
  closeOnEsc?: boolean
  /** 설정 시 Escape 키는 `onClose` 대신 이 콜백만 호출한다(미저장 확인 등). */
  onEscapeRequest?: () => void
  /**
   * 기본(default)은 좁은 알림형 패널(w-[90%] max-w-md p-4).
   * largeForm 은 헤더·스크롤 바디·고정 풋터용 넓은 폼 모달(폭·높이·flex는 Tailwind 로 고정).
   */
  panelPreset?: 'default' | 'largeForm'
  usePortal?: boolean
  /**
   * true 이면 모달이 열린 동안 `history.pushState` 로 sentinel 을 쌓고,
   * Android 뒤로가기 / 브라우저 back(popstate) 시 라우트 이탈 대신 `onEscapeRequest`(또는 onClose) 를 호출한다.
   * 미저장 확인 등은 `onEscapeRequest` 안에서 처리한다. 기본 false(대부분의 다이얼로그는 변경 없음).
   */
  closeOnHistoryBack?: boolean
}

export function BaseDialog({
  open,
  onClose,
  children,
  ariaLabel = '대화상자',
  panelClassName = '',
  overlayClassName = '',
  initialFocusRef,
  closeOnBackdrop = true,
  closeOnEsc = true,
  onEscapeRequest,
  panelPreset = 'default',
  usePortal = false,
  closeOnHistoryBack = false,
}: BaseDialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const openRef = useRef(open)
  openRef.current = open
  const onEscapeRequestRef = useRef(onEscapeRequest)
  onEscapeRequestRef.current = onEscapeRequest
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const historyBackArmedRef = useRef(false)

  const panelSizingClasses =
    panelPreset === 'largeForm'
      ? '!w-[min(1080px,92vw)] !max-w-none !max-h-[86vh] !min-h-0 !flex !flex-col !overflow-hidden !p-0'
      : 'w-[90%] max-w-md p-4'

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (onEscapeRequest) {
        event.preventDefault()
        onEscapeRequest()
        return
      }
      if (closeOnEsc) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeOnEsc, onClose, onEscapeRequest, open])

  useEffect(() => {
    if (!closeOnHistoryBack || !open) {
      return
    }
    window.history.pushState({ __BASE_DIALOG_BACK_TRAP__: true }, '', window.location.href)
    historyBackArmedRef.current = true

    const onPopState = () => {
      if (!openRef.current) {
        return
      }
      historyBackArmedRef.current = false
      const esc = onEscapeRequestRef.current
      if (esc) {
        esc()
      } else {
        onCloseRef.current()
      }
      window.queueMicrotask(() => {
        if (openRef.current && closeOnHistoryBack) {
          window.history.pushState({ __BASE_DIALOG_BACK_TRAP__: true }, '', window.location.href)
          historyBackArmedRef.current = true
        }
      })
    }

    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      if (historyBackArmedRef.current) {
        historyBackArmedRef.current = false
        // 정상 닫기(저장/취소) 시 history.back/go(-1) 하면 sentinel 이전 항목(메뉴 등)으로
        // SPA 가 이탈할 수 있다. trap 플래그만 제거하고 현재 URL 은 유지한다.
        try {
          const currentState =
            typeof window.history.state === 'object' && window.history.state != null
              ? { ...(window.history.state as Record<string, unknown>) }
              : {}
          delete currentState.__BASE_DIALOG_BACK_TRAP__
          window.history.replaceState(currentState, '', window.location.href)
        } catch {
          // no-op
        }
      }
    }
  }, [open, closeOnHistoryBack])

  useEffect(() => {
    if (!open) {
      return
    }
    const rafId = window.requestAnimationFrame(() => {
      const focusTarget = initialFocusRef?.current ?? panelRef.current
      focusTarget?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(rafId)
  }, [initialFocusRef, open])

  if (!open) {
    return null
  }

  /*
   * z-index 정책:
   *   - 모바일 모달(`mobile-modal-overlay`) 이 z-index: 9999 로 최상위에 떠 있을 때,
   *     그 모달 안에서 확인 다이얼로그(ConfirmDialog → BaseDialog) 가 열리는
   *     케이스가 있다 (예: 모바일 상담 모달에서 항목 삭제 확인).
   *     이 다이얼로그는 모바일 모달 위에 **반드시** 떠야 하므로 9999 초과의
   *     z-index 가 필요하다. `z-[10000]` 로 고정해 그 이상은 쓰지 않는다.
   *   - 관련 파일: src/features/customers/components/mobile/CustomerConsultationsModal.tsx
   */
  const dialogNode = (
    <div
      className={`customer-ui-modal-backdrop fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4 ${overlayClassName}`.trim()}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose()
        }
        /*
         * 이 다이얼로그가 또 다른 overlay(예: 모바일 모달) 안 혹은 형제로
         * 놓여있을 때, backdrop/패널 클릭이 상위 overlay 로 버블돼 상위 overlay 를
         * 닫아버리는 회귀를 막는다. 이 다이얼로그의 클릭은 여기서 소비된다.
         */
        event.stopPropagation()
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        className={`customer-ui-modal-panel rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] shadow-lg outline-none ${panelSizingClasses} ${panelClassName}`.trim()}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )

  if (usePortal && typeof document !== 'undefined') {
    return createPortal(dialogNode, document.body)
  }
  return dialogNode
}
