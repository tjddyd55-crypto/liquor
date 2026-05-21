/** GET /api/todos 응답 항목 (camelCase 클라 응결) */
export type TodoDto = {
  id: string
  tenantId: string | null
  gaId: number
  ownerUserId: string
  assigneeUserId: string | null
  title: string
  description: string
  dueDate: string | null
  dueTime: string | null
  status: TodoStatus
  priority: TodoPriority
  sourceType: TodoSourceType
  sourceId: string | null
  relatedEntityType: RelatedEntityType | null
  relatedEntityId: string | null
  metadata: Record<string, unknown> | null
  createdAt: string | null
  updatedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  customerName: string | null
}

export type TodoStatus = 'pending' | 'completed' | 'canceled'

export type TodoPriority = 'low' | 'normal' | 'high'

export type TodoSourceType =
  | 'manual'
  | 'customer_memo'
  | 'consultation_note'
  | 'pdf_document'
  | 'e_document'
  | 'system'

export type RelatedEntityType = 'customer' | 'document' | 'e_document' | 'case' | 'tenant'
