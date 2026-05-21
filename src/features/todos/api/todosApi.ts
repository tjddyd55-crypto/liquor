import { apiRequest } from '../../../lib/apiClient'
import type { TodoDto } from '../domain/todoTypes'

export type ListTodosParams = {
  status?: string
  bucket?: string
  due?: string
  overdue?: string
  hasRelated?: string
  sourceType?: string
}

function buildTodosQuery(ps: ListTodosParams): string {
  const q = new URLSearchParams()
  if (ps.status) q.set('status', ps.status)
  if (ps.bucket) q.set('bucket', ps.bucket)
  if (ps.due) q.set('due', ps.due)
  if (ps.overdue) q.set('overdue', ps.overdue)
  if (ps.hasRelated) q.set('hasRelated', ps.hasRelated)
  if (ps.sourceType) q.set('sourceType', ps.sourceType)
  const s = q.toString()
  return s ? `?${s}` : ''
}

export async function listTodos(token: string, params: ListTodosParams = {}): Promise<TodoDto[]> {
  return apiRequest<TodoDto[]>(`/api/todos${buildTodosQuery(params)}`, { token })
}

export type CreateTodoBody = {
  sourceType?: string
  sourceId?: string | null
  title: string
  description?: string
  dueDate?: string | null
  dueTime?: string | null
  priority?: string
  relatedEntityType?: string | null
  relatedEntityId?: string | null
}

export async function createTodo(token: string, body: CreateTodoBody): Promise<TodoDto> {
  return apiRequest<TodoDto>(`/api/todos`, {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}

export type PatchTodoBody = {
  title?: string
  description?: string | null
  dueDate?: string | null
  dueTime?: string | null
  priority?: string
  relatedEntityType?: string | null
  relatedEntityId?: string | null
  status?: string
}

export async function patchTodo(token: string, todoId: string, body: PatchTodoBody): Promise<TodoDto> {
  return apiRequest<TodoDto>(`/api/todos/${encodeURIComponent(todoId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(body),
  })
}

export async function completeTodo(token: string, todoId: string): Promise<TodoDto> {
  return apiRequest<TodoDto>(`/api/todos/${encodeURIComponent(todoId)}/complete`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({}),
  })
}

export async function reopenTodo(token: string, todoId: string): Promise<TodoDto> {
  return apiRequest<TodoDto>(`/api/todos/${encodeURIComponent(todoId)}/reopen`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({}),
  })
}

export async function deleteTodo(token: string, todoId: string): Promise<void> {
  await apiRequest<void>(`/api/todos/${encodeURIComponent(todoId)}`, { method: 'DELETE', token })
}
