import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { useAuth } from '../../auth/AuthProvider'
import type { TodoDto } from '../domain/todoTypes'
import { completeTodo, listTodos, reopenTodo } from '../api/todosApi'
import { buildRelatedEntityHref } from '../utils/relatedEntityNavigate'

export type TodoQuickFilter =
  | 'all'
  | 'today'
  | 'tomorrow'
  | 'week'
  | 'open'
  | 'completed'
  | 'overdue'
export type TodoRelatedFilter = 'any' | 'yes' | 'no'

export function useTodosWorkspaceState() {
  const { token, user } = useAuth()
  const gaId = user?.gaId != null && Number.isFinite(Number(user.gaId)) ? Number(user.gaId) : null
  const navigate = useNavigate()

  const [quick, setQuick] = useState<TodoQuickFilter>('open')
  const [relatedFilter, setRelatedFilter] = useState<TodoRelatedFilter>('any')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [todos, setTodos] = useState<TodoDto[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorSession, setEditorSession] = useState(0)
  const [editingTodo, setEditingTodo] = useState<TodoDto | null>(null)

  const listParams = useMemo(() => {
    const ps: Parameters<typeof listTodos>[1] = {}
    if (quick === 'open') ps.bucket = 'open'
    if (quick === 'completed') ps.status = 'completed'
    if (quick === 'today') ps.due = 'today'
    if (quick === 'tomorrow') ps.due = 'tomorrow'
    if (quick === 'week') ps.due = 'week'
    if (quick === 'overdue') ps.overdue = 'true'
    if (relatedFilter === 'yes') ps.hasRelated = 'yes'
    if (relatedFilter === 'no') ps.hasRelated = 'no'
    if (sourceFilter !== 'all') ps.sourceType = sourceFilter
    return ps
  }, [quick, relatedFilter, sourceFilter])

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setTodos([])
      return
    }
    setLoading(true)
    setError('')
    try {
      const rows = await listTodos(token, listParams)
      setTodos(rows)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'
      setError(msg)
      setTodos([])
    } finally {
      setLoading(false)
    }
  }, [token, listParams])

  useEffect(() => {
    void load()
  }, [load])

  const openCreateBlank = () => {
    setEditingTodo(null)
    setEditorSession((k) => k + 1)
    setEditorOpen(true)
  }

  const openEdit = (row: TodoDto) => {
    setEditingTodo(row)
    setEditorSession((k) => k + 1)
    setEditorOpen(true)
  }

  const toggleDone = async (row: TodoDto) => {
    if (!token?.trim()) return
    setError('')
    try {
      let nextRow: TodoDto
      if (row.status === 'completed') {
        nextRow = await reopenTodo(token, row.id)
      } else if (row.status === 'pending') {
        nextRow = await completeTodo(token, row.id)
      } else {
        return
      }
      setTodos((prev) => prev.map((t) => (t.id === nextRow.id ? nextRow : t)))
      await load()
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : '상태 변경에 실패했습니다.'
      setError(msg)
    }
  }

  const onRelatedNavigate = useCallback(
    (row: TodoDto) => {
      const href = buildRelatedEntityHref(row.relatedEntityType, row.relatedEntityId)
      if (href) {
        navigate(href, { replace: false })
        return true
      }
      return false
    },
    [navigate],
  )

  return {
    token: token ?? '',
    gaId,
    todos,
    loading,
    error,
    quickFilter: quick,
    setQuickFilter: setQuick,
    relatedFilter,
    setRelatedFilter,
    sourceFilter,
    setSourceFilter,
    reload: load,
    editorOpen,
    setEditorOpen,
    editorSession,
    editingTodo,
    openCreateBlank,
    openEdit,
    toggleDone,
    onRelatedNavigate,
  }
}
