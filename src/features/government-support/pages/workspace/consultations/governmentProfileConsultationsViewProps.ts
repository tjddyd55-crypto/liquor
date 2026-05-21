import type { FormEvent } from 'react'
import type { GovProfileConsultation } from '../../types/governmentProfile.types'

export type GovernmentProfileConsultationsViewProps = {
  error: string
  body: string
  consultDate: string
  busy: boolean
  rows: GovProfileConsultation[]
  onSetBody: (value: string) => void
  onSetConsultDate: (value: string) => void
  onSubmit: (e: FormEvent) => void | Promise<void>
  onDelete: (consultId: string) => void | Promise<void>
  onAddTodoFromConsultation?: (consultId: string, plainBody: string) => void
}
