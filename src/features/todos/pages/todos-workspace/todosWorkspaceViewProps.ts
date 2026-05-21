import type { TodoDto } from '../domain/todoTypes'
import type { TodoRelatedFilter, TodoQuickFilter } from '../hooks/useTodosWorkspaceState'

export type TodosWorkspaceViewProps = {
  token: string
  gaId: number | null
  todos: TodoDto[]
  loading: boolean
  error: string
  quickFilter: TodoQuickFilter
  setQuickFilter: (v: TodoQuickFilter) => void
  relatedFilter: TodoRelatedFilter
  setRelatedFilter: (v: TodoRelatedFilter) => void
  sourceFilter: string
  setSourceFilter: (v: string) => void
  openCreateBlank: () => void
  openEdit: (row: TodoDto) => void
  toggleDone: (row: TodoDto) => void
  onRelatedNavigate: (row: TodoDto) => boolean
}
