import { FormButton, FormTextarea } from '../../../components/form'
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import type { Note } from '../types/memo.types'

const MIN_W = 200
const MIN_H = 150
const FONT_MIN = 12
const FONT_MAX = 24

const clamp = (value: number, min: number, max: number) => {
  return Math.max(min, Math.min(value, max))
}

type Props = {
  note: Note
  isActive: boolean
  isEditing: boolean
  isDragging: boolean
  onChange: (content: string) => void
  onPositionChange: (id: string, x: number, y: number) => void
  onSizeChange: (id: string, width: number, height: number) => void
  onFontSizeChange: (id: string, fontSize: number) => void
  containerRef: RefObject<HTMLElement | null>
  getWorkspaceBounds: () => { width: number; height: number }
  onDeleteRequest: (id: string) => void
  /** 루트 클릭: 앞으로 + 선택 */
  onRootClick: (id: string) => void
  /** 클릭·헤더 등: 선택 (z-index 변경 없음) */
  onActivate: (id: string) => void
  /** textarea focus: 선택 + 편집 (z-index 변경 없음) */
  onTextareaFocus: (id: string) => void
  onTextareaBlur: () => void
  onDragStart: (id: string) => void
  onDragEnd: () => void
  /** 캔버스에서 숨김(상위에서 렌더 생략과 별개로 버튼만 제공할 때) */
  onMinimize?: (id: string) => void
}

export default function StickyNote({
  note,
  isActive,
  isEditing,
  isDragging,
  onChange,
  onPositionChange,
  onSizeChange,
  onFontSizeChange,
  containerRef,
  getWorkspaceBounds,
  onDeleteRequest,
  onRootClick,
  onActivate,
  onTextareaFocus,
  onTextareaBlur,
  onDragStart,
  onDragEnd,
  onMinimize,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0 })
  const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 })

  const w = Math.max(MIN_W, Number(note.width) || 200)
  const h = Math.max(MIN_H, Number(note.height) || 160)
  const fs = Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(Number(note.fontSize) || 16)))

  const handleDragStart = (clientX: number, clientY: number) => {
    if (resizing) {
      return
    }
    onDragStart(note.id)
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    const mouseX = clientX - rect.left
    const mouseY = clientY - rect.top
    offsetRef.current = { x: mouseX - note.x, y: mouseY - note.y }
    setDragging(true)
  }

  const handleDragHandleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    handleDragStart(e.clientX, e.clientY)
  }

  const handleDragHandleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const t = e.touches[0]
    if (!t) {
      return
    }
    handleDragStart(t.clientX, t.clientY)
  }

  useEffect(() => {
    if (!dragging) {
      return
    }
    const onMove = (e: MouseEvent) => {
      if (resizing) {
        return
      }
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      const rawX = e.clientX - rect.left - offsetRef.current.x
      const rawY = e.clientY - rect.top - offsetRef.current.y
      const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceBounds()
      if (workspaceWidth === 0 || workspaceHeight === 0) {
        return
      }
      const maxX = Math.max(0, workspaceWidth - w)
      const maxY = Math.max(0, workspaceHeight - h)
      const nextX = clamp(rawX, 0, maxX)
      const nextY = clamp(rawY, 0, maxY)
      onPositionChange(note.id, nextX, nextY)
    }
    const onUp = () => {
      setDragging(false)
      onDragEnd()
    }
    const onTouchMove = (e: TouchEvent) => {
      if (resizing) {
        return
      }
      e.preventDefault()
      const touch = e.touches[0]
      if (!touch) {
        return
      }
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      const rawX = touch.clientX - rect.left - offsetRef.current.x
      const rawY = touch.clientY - rect.top - offsetRef.current.y
      const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceBounds()
      if (workspaceWidth === 0 || workspaceHeight === 0) {
        return
      }
      const maxX = Math.max(0, workspaceWidth - w)
      const maxY = Math.max(0, workspaceHeight - h)
      const nextX = clamp(rawX, 0, maxX)
      const nextY = clamp(rawY, 0, maxY)
      onPositionChange(note.id, nextX, nextY)
    }
    const onTouchEnd = () => {
      setDragging(false)
      onDragEnd()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [containerRef, dragging, getWorkspaceBounds, h, note.id, onDragEnd, onPositionChange, resizing, w])

  const handleResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onActivate(note.id)
    const w0 = Math.max(MIN_W, Number(note.width) || 200)
    const h0 = Math.max(MIN_H, Number(note.height) || 160)
    resizeStartRef.current = { x: e.clientX, y: e.clientY, w: w0, h: h0 }
    setResizing(true)
  }

  useEffect(() => {
    if (!resizing) {
      return
    }
    const onMove = (e: PointerEvent) => {
      const dx = e.clientX - resizeStartRef.current.x
      const dy = e.clientY - resizeStartRef.current.y
      const nw = Math.max(MIN_W, resizeStartRef.current.w + dx)
      const nh = Math.max(MIN_H, resizeStartRef.current.h + dy)
      onSizeChange(note.id, nw, nh)
    }
    const onUp = () => {
      setResizing(false)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [resizing, note.id, onSizeChange])

  const bumpFont = (delta: number) => {
    onActivate(note.id)
    onFontSizeChange(note.id, fs + delta)
  }

  const rootClass =
    `memo-sticky-note__root bg-yellow-100 flex flex-col overflow-hidden ${isActive ? 'memo-sticky-note__root--active' : ''}` +
    (isDragging ? ' opacity-95' : '')

  return (
    <div
      className={rootClass}
      onClick={(e) => {
        if (e.target !== e.currentTarget) {
          return
        }
        onRootClick(note.id)
      }}
      style={{
        position: 'absolute',
        left: note.x,
        top: note.y,
        width: w,
        height: h,
        zIndex: Number(note.zIndex) || 0,
        touchAction: 'manipulation',
      }}
    >
      <div className="memo-sticky-note__header shrink-0 flex flex-nowrap items-center justify-between gap-1 overflow-x-auto bg-yellow-200/90 border-b border-amber-300/80">
        <FormButton
          htmlType="button"
          variant="action"
          className="memo-sticky-note__drag flex min-w-0 flex-1 items-center gap-1 rounded px-1 text-left text-amber-900/80 cursor-grab select-none active:cursor-grabbing touch-manipulation"
          aria-label="메모 위치 이동"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={handleDragHandleMouseDown}
          onTouchStart={handleDragHandleTouchStart}
        >
          <span aria-hidden>⋮⋮</span>
          <span className="truncate">이동</span>
        </FormButton>
        <div className="flex shrink-0 items-center gap-1">
          {onMinimize ? (
            <FormButton
              htmlType="button"
              variant="action"
              className="memo-sticky-note__minimize-btn inline-flex min-w-[28px] items-center justify-center rounded border border-amber-400/80 bg-yellow-50/90 font-semibold text-amber-900 touch-manipulation"
              aria-label="메모 숨기기"
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                onMinimize(note.id)
              }}
            >
              -
            </FormButton>
          ) : null}
          <FormButton
            htmlType="button"
            variant="action"
            className="memo-sticky-note__font-btn inline-flex min-w-[28px] items-center justify-center rounded border border-amber-400/80 bg-yellow-50/90 font-semibold text-amber-900 touch-manipulation"
            aria-label="글자 크기 줄이기"
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              bumpFont(-1)
            }}
          >
            A−
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className="memo-sticky-note__font-btn inline-flex min-w-[28px] items-center justify-center rounded border border-amber-400/80 bg-yellow-50/90 font-semibold text-amber-900 touch-manipulation"
            aria-label="글자 크기 키우기"
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              bumpFont(1)
            }}
          >
            A+
          </FormButton>
        </div>
        <FormButton
          htmlType="button"
          variant="action"
          className="memo-sticky-note__delete inline-flex shrink-0 items-center justify-center rounded text-red-500 hover:text-red-700 touch-manipulation"
          aria-label="메모 삭제"
          onTouchStart={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            onDeleteRequest(note.id)
          }}
        >
          ✕
        </FormButton>
      </div>
      <div className="memo-sticky-note__content">
        <FormTextarea
          className={`memo-sticky-note__textarea touch-manipulation ${
            isEditing ? 'memo-sticky-note__textarea--editing' : ''
          }`}
          style={
            {
              '--memo-font-size': `${fs}px`,
            } as CSSProperties
          }
          value={note.content}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => onTextareaFocus(note.id)}
          onBlur={() => onTextareaBlur()}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => {
            e.stopPropagation()
          }}
          placeholder="메모를 입력하세요"
          aria-label="메모 내용"
          inputMode="text"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
        />
      </div>
      <div
        role="presentation"
        className="memo-sticky-note__resize absolute bottom-0 right-0 z-10 flex h-10 w-10 min-h-[40px] min-w-[40px] cursor-nwse-resize touch-none select-none items-end justify-end p-1"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={handleResizePointerDown}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <span
          className="pointer-events-none inline-block h-3 w-3 border-b-2 border-r-2 border-amber-700/70"
          aria-hidden
        />
      </div>
    </div>
  )
}
