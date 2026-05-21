/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { useNotes } from '../hooks/useNotes'
import { loadMemoUiSnapshot, patchMemoUiCanvas } from '../memoUiStorage'

type MemoWorkspaceContextValue = ReturnType<typeof useNotes> & {
  token: string | undefined
  workspaceRef: React.RefObject<HTMLDivElement | null>
  containerRef: React.RefObject<HTMLDivElement | null>
  activeNoteId: string | null
  editingNoteId: string | null
  draggingNoteId: string | null
  pendingDeleteId: string | null
  deleteSubmitting: boolean
  canvasHeight: number | undefined
  getWorkspaceBounds: () => { width: number; height: number }
  promoteNote: (id: string) => void
  handleRootClick: (id: string) => void
  handleActivate: (id: string) => void
  handleTextareaFocus: (id: string) => void
  handleTextareaBlur: () => void
  handleDragStart: (id: string) => void
  handleDragEnd: () => void
  handleRequestDelete: (id: string) => void
  handleSidebarSelectNote: (id: string) => void
  handleCanvasClick: (e: ReactMouseEvent<HTMLDivElement>) => void
  handleAutoArrange: () => void
  closeDeleteModal: () => void
  confirmDelete: () => Promise<void>
  isMinimized: boolean
  setIsMinimized: Dispatch<SetStateAction<boolean>>
  /** 캔버스에서 숨김(프론트 전용, DB 미사용) — 리스트에서 복구 */
  hiddenNotes: Record<string, boolean>
  minimizeNote: (id: string) => void
  restoreNote: (id: string) => void
}

const MemoWorkspaceContext = createContext<MemoWorkspaceContextValue | null>(null)

export function useMemoWorkspace() {
  const v = useContext(MemoWorkspaceContext)
  if (!v) {
    throw new Error('useMemoWorkspace must be used within MemoWorkspaceProvider')
  }
  return v
}

export function MemoWorkspaceProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const persistenceUserId = String(user?.id ?? '')
  const notesApi = useNotes()
  const { notes, updatePosition, deleteNote, bringToFront } = notesApi

  const workspaceRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const activeNoteIdRef = useRef<string | null>(null)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [draggingNoteId, setDraggingNoteId] = useState<string | null>(null)

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const [deleteSubmitting, setDeleteSubmitting] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [hiddenNotes, setHiddenNotes] = useState<Record<string, boolean>>({})
  const canvasHydratedRef = useRef(false)
  const skipCanvasPersistRef = useRef(true)

  useEffect(() => {
    skipCanvasPersistRef.current = true
  }, [persistenceUserId])

  useEffect(() => {
    if (!persistenceUserId) {
      canvasHydratedRef.current = false
      return
    }
    const snap = loadMemoUiSnapshot(persistenceUserId)
    if (snap?.canvas) {
      setIsMinimized(snap.canvas.isMinimized)
      const nextHidden: Record<string, boolean> = {}
      for (const id of snap.canvas.hiddenNoteIds) {
        nextHidden[id] = true
      }
      setHiddenNotes(nextHidden)
    }
    canvasHydratedRef.current = true
  }, [persistenceUserId])

  useEffect(() => {
    if (!persistenceUserId || !canvasHydratedRef.current) {
      return
    }
    if (skipCanvasPersistRef.current) {
      skipCanvasPersistRef.current = false
      return
    }
    patchMemoUiCanvas(persistenceUserId, {
      isMinimized,
      hiddenNoteIds: Object.keys(hiddenNotes).filter((id) => hiddenNotes[id]),
    })
  }, [persistenceUserId, isMinimized, hiddenNotes])

  const minimizeNote = useCallback((id: string) => {
    setHiddenNotes((prev) => ({
      ...prev,
      [id]: true,
    }))
  }, [])

  const restoreNote = useCallback((id: string) => {
    setHiddenNotes((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  useEffect(() => {
    activeNoteIdRef.current = activeNoteId
  }, [activeNoteId])

  const getWorkspaceBounds = useCallback(() => {
    const el = workspaceRef.current
    if (!el) {
      return { width: 0, height: 0 }
    }
    return {
      width: el.clientWidth,
      height: Math.max(el.scrollHeight, el.clientHeight),
    }
  }, [])

  const canvasHeight = useMemo(() => {
    const visible = notes.filter((n) => !hiddenNotes[n.id])
    if (visible.length === 0) {
      return undefined
    }
    const bottoms = visible.map((n) => {
      const h = Math.max(150, Number(n.height) || 160)
      return n.y + h
    })
    const maxY = Math.max(...bottoms)
    return maxY + 100
  }, [notes, hiddenNotes])

  useEffect(() => {
    if (notes.length === 0 || draggingNoteId != null) {
      return
    }
    const { width: workspaceWidth, height: workspaceHeight } = getWorkspaceBounds()
    if (workspaceWidth === 0 || workspaceHeight === 0) {
      return
    }
    notes.forEach((note) => {
      const noteWidth = Math.max(200, Number(note.width) || 200)
      const noteHeight = Math.max(150, Number(note.height) || 160)
      const maxX = Math.max(0, workspaceWidth - noteWidth)
      const maxY = Math.max(0, workspaceHeight - noteHeight)

      const fixedX = Math.max(0, Math.min(note.x, maxX))
      const fixedY = Math.max(0, Math.min(note.y, maxY))

      if (fixedX !== note.x || fixedY !== note.y) {
        updatePosition(note.id, fixedX, fixedY)
      }
    })
  }, [draggingNoteId, getWorkspaceBounds, notes, updatePosition])

  const promoteNote = useCallback(
    (id: string) => {
      if (activeNoteIdRef.current === id) {
        setActiveNoteId(id)
        return
      }

      bringToFront(id)
      activeNoteIdRef.current = id
      setActiveNoteId(id)
    },
    [bringToFront],
  )

  const handleRootClick = useCallback(
    (id: string) => {
      promoteNote(id)
    },
    [promoteNote],
  )

  const handleActivate = useCallback((id: string) => {
    activeNoteIdRef.current = id
    setActiveNoteId(id)
  }, [])

  const handleTextareaFocus = useCallback(
    (id: string) => {
      promoteNote(id)
      setEditingNoteId(id)
    },
    [promoteNote],
  )

  const handleTextareaBlur = useCallback(() => {
    setEditingNoteId(null)
  }, [])

  const handleDragStart = useCallback(
    (id: string) => {
      setEditingNoteId(null)
      promoteNote(id)
      setDraggingNoteId(id)
    },
    [promoteNote],
  )

  const handleDragEnd = useCallback(() => {
    setDraggingNoteId(null)
  }, [])

  const handleRequestDelete = useCallback((id: string) => {
    setPendingDeleteId(id)
  }, [])

  const handleSidebarSelectNote = useCallback(
    (id: string) => {
      setIsMinimized(false)
      // 리스트에서 선택해도 캔버스 클릭과 동일하게 최상단으로 승격한다.
      bringToFront(id)
      activeNoteIdRef.current = id
      setActiveNoteId(id)
      const note = notes.find((n) => n.id === id)
      const y = note ? note.y : 0
      requestAnimationFrame(() => {
        workspaceRef.current?.scrollTo({
          top: Math.max(0, y - 40),
          behavior: 'smooth',
        })
      })
    },
    [bringToFront, notes, setIsMinimized],
  )

  const handleCanvasClick = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      activeNoteIdRef.current = null
      setActiveNoteId(null)
    }
  }, [])

  const handleAutoArrange = useCallback(() => {
    const gap = 20
    const startX = 20
    const startY = 20
    const rightPad = 20

    const { width: workspaceWidth } = getWorkspaceBounds()
    if (workspaceWidth === 0) {
      return
    }

    const maxRight = workspaceWidth - rightPad
    let x = startX
    let y = startY
    let rowMaxHeight = 0

    notes.forEach((note) => {
      const noteWidth = Math.max(200, Number(note.width) || 200)
      const noteHeight = Math.max(150, Number(note.height) || 160)

      if (x > startX && x + noteWidth > maxRight) {
        y += rowMaxHeight + gap
        x = startX
        rowMaxHeight = 0
      }

      updatePosition(note.id, x, y)
      rowMaxHeight = Math.max(rowMaxHeight, noteHeight)
      x += noteWidth + gap
    })
  }, [getWorkspaceBounds, notes, updatePosition])

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) {
      return
    }
    setPendingDeleteId(null)
  }, [deleteSubmitting])

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId || deleteSubmitting) {
      return
    }
    setDeleteSubmitting(true)
    try {
      const id = pendingDeleteId
      await deleteNote(id)
      setHiddenNotes((prev) => {
        if (!(id in prev)) {
          return prev
        }
        const next = { ...prev }
        delete next[id]
        return next
      })
      setActiveNoteId((prev) => {
        const next = prev === id ? null : prev
        activeNoteIdRef.current = next
        return next
      })
      setEditingNoteId((prev) => (prev === id ? null : prev))
      setDraggingNoteId((prev) => (prev === id ? null : prev))
      setPendingDeleteId(null)
    } finally {
      setDeleteSubmitting(false)
    }
  }, [pendingDeleteId, deleteSubmitting, deleteNote])

  const value = useMemo<MemoWorkspaceContextValue>(
    () => ({
      ...notesApi,
      token: token?.trim(),
      workspaceRef,
      containerRef,
      activeNoteId,
      editingNoteId,
      draggingNoteId,
      pendingDeleteId,
      deleteSubmitting,
      canvasHeight,
      getWorkspaceBounds,
      promoteNote,
      handleRootClick,
      handleActivate,
      handleTextareaFocus,
      handleTextareaBlur,
      handleDragStart,
      handleDragEnd,
      handleRequestDelete,
      handleSidebarSelectNote,
      handleCanvasClick,
      handleAutoArrange,
      closeDeleteModal,
      confirmDelete,
      isMinimized,
      setIsMinimized,
      hiddenNotes,
      minimizeNote,
      restoreNote,
    }),
    [
      notesApi,
      token,
      activeNoteId,
      editingNoteId,
      draggingNoteId,
      pendingDeleteId,
      deleteSubmitting,
      canvasHeight,
      getWorkspaceBounds,
      promoteNote,
      handleRootClick,
      handleActivate,
      handleTextareaFocus,
      handleTextareaBlur,
      handleDragStart,
      handleDragEnd,
      handleRequestDelete,
      handleSidebarSelectNote,
      handleCanvasClick,
      handleAutoArrange,
      closeDeleteModal,
      confirmDelete,
      isMinimized,
      hiddenNotes,
      minimizeNote,
      restoreNote,
    ],
  )

  return <MemoWorkspaceContext.Provider value={value}>{children}</MemoWorkspaceContext.Provider>
}
