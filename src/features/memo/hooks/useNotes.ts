import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { memoApi } from '../api/memo.api'
import type { Note } from '../types/memo.types'

const CONTENT_SAVE_MS = 400
const POSITION_SAVE_MS = 350
const SIZE_SAVE_MS = 350
const FONT_SAVE_MS = 350

const MIN_W = 200
const MIN_H = 150
const FONT_MIN = 12
const FONT_MAX = 24

/** 승격 시 다음 z가 이 값을 넘으면 전체 재번호 후 맨 앞으로 (무한 증가 방지) */
const MAX_Z = 10_000

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function useNotes() {
  const { token } = useAuth()
  const [notes, setNotes] = useState<Note[]>([])
  const [notesLoading, setNotesLoading] = useState(false)
  const contentTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const positionTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const sizeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const fontTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    const ct = contentTimersRef.current
    const pt = positionTimersRef.current
    const st = sizeTimersRef.current
    const ft = fontTimersRef.current
    return () => {
      Object.values(ct).forEach((t) => clearTimeout(t))
      Object.values(pt).forEach((t) => clearTimeout(t))
      Object.values(st).forEach((t) => clearTimeout(t))
      Object.values(ft).forEach((t) => clearTimeout(t))
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) {
        return
      }
      if (!token?.trim()) {
        setNotes([])
        setNotesLoading(false)
        return
      }
      setNotesLoading(true)
      void memoApi
        .getAll(token)
        .then((rows) => {
          if (!cancelled) {
            const apiData = rows.map((r) => ({
              ...r,
              zIndex: Number(r.zIndex) || 0,
            }))
            setNotes(apiData)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setNotes([])
          }
        })
        .finally(() => {
          if (!cancelled) {
            setNotesLoading(false)
          }
        })
    })
    return () => {
      cancelled = true
    }
  }, [token])

  const addNote = useCallback(async () => {
    const auth = token?.trim()
    if (!auth) {
      return
    }
    try {
      const z = Date.now()
      const newNote = await memoApi.create({ content: '', x: 100, y: 100, zIndex: z }, auth)
      setNotes((prev) => [...prev, { ...newNote, zIndex: newNote.zIndex ?? z }])
    } catch {
      // 실패 시 목록은 그대로
    }
  }, [token])

  const updateNote = useCallback(
    (id: string, content: string) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, content } : n)))
      const auth = token?.trim()
      if (!auth) {
        return
      }
      const prev = contentTimersRef.current[id]
      if (prev) {
        clearTimeout(prev)
      }
      contentTimersRef.current[id] = setTimeout(() => {
        delete contentTimersRef.current[id]
        void memoApi.update(id, { content }, auth).catch(() => {})
      }, CONTENT_SAVE_MS)
    },
    [token],
  )

  const updatePosition = useCallback(
    (id: string, x: number, y: number) => {
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)))
      const auth = token?.trim()
      if (!auth) {
        return
      }
      const prev = positionTimersRef.current[id]
      if (prev) {
        clearTimeout(prev)
      }
      positionTimersRef.current[id] = setTimeout(() => {
        delete positionTimersRef.current[id]
        void memoApi.update(id, { x, y }, auth).catch(() => {})
      }, POSITION_SAVE_MS)
    },
    [token],
  )

  const updateSize = useCallback(
    (id: string, width: number, height: number) => {
      const w = clamp(Math.round(width), MIN_W, 4000)
      const h = clamp(Math.round(height), MIN_H, 4000)
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, width: w, height: h } : n)))
      const auth = token?.trim()
      if (!auth) {
        return
      }
      const prev = sizeTimersRef.current[id]
      if (prev) {
        clearTimeout(prev)
      }
      sizeTimersRef.current[id] = setTimeout(() => {
        delete sizeTimersRef.current[id]
        void memoApi.update(id, { width: w, height: h }, auth).catch(() => {})
      }, SIZE_SAVE_MS)
    },
    [token],
  )

  const updateFontSize = useCallback(
    (id: string, fontSize: number) => {
      const f = clamp(Math.round(fontSize), FONT_MIN, FONT_MAX)
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, fontSize: f } : n)))
      const auth = token?.trim()
      if (!auth) {
        return
      }
      const prev = fontTimersRef.current[id]
      if (prev) {
        clearTimeout(prev)
      }
      fontTimersRef.current[id] = setTimeout(() => {
        delete fontTimersRef.current[id]
        void memoApi.update(id, { fontSize: f }, auth).catch(() => {})
      }, FONT_SAVE_MS)
    },
    [token],
  )

  const deleteNote = useCallback(
    async (id: string) => {
      const auth = token?.trim()
      if (!auth) {
        return
      }
      try {
        await memoApi.delete(id, auth)
        setNotes((prev) => prev.filter((n) => n.id !== id))
      } catch {
        // 유지
      }
    },
    [token],
  )

  const bringToFront = useCallback(
    (id: string) => {
      setNotes((prev) => {
        const zVal = (n: Note) => Number(n.zIndex) || 0
        const maxZ = Math.max(0, ...prev.map((n) => zVal(n)))
        let nextZ = maxZ + 1
        const auth = token?.trim()

        if (nextZ > MAX_Z) {
          const sorted = [...prev].sort(
            (a, b) =>
              zVal(a) - zVal(b) || String(a.id).localeCompare(String(b.id)),
          )
          const normalized = sorted.map((n, i) => ({
            ...n,
            zIndex: i + 1,
          }))
          nextZ = normalized.length + 1
          const next = normalized.map((n) =>
            n.id === id ? { ...n, zIndex: nextZ } : n,
          )

          if (auth) {
            next.forEach((note) => {
              const before = prev.find((p) => p.id === note.id)
              const oldZ = before ? zVal(before) : -1
              const newZ = zVal(note)
              if (oldZ !== newZ) {
                void memoApi.update(note.id, { zIndex: newZ }, auth).catch(() => {})
              }
            })
          }
          return next
        }

        if (auth) {
          void memoApi.update(id, { zIndex: nextZ }, auth).catch(() => {})
        }
        return prev.map((n) => (n.id === id ? { ...n, zIndex: nextZ } : n))
      })
    },
    [token],
  )

  return {
    notes,
    notesLoading,
    addNote,
    updateNote,
    updatePosition,
    updateSize,
    updateFontSize,
    deleteNote,
    bringToFront,
  }
}
