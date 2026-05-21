import type { FormEvent } from 'react'
import type { GovProfileProgressEvent } from '../../types/governmentProfile.types'
import type { GovernmentProfileProgressSummaryModel } from '../../utils/governmentProfileProgressSummary'

export type GovernmentProfileProgressViewProps = {
  error: string
  status: string
  title: string
  content: string
  eventDate: string
  busy: boolean
  rows: GovProfileProgressEvent[]
  summary: GovernmentProfileProgressSummaryModel
  statusOptions: readonly string[]
  onSetStatus: (value: string) => void
  onSetTitle: (value: string) => void
  onSetContent: (value: string) => void
  onSetEventDate: (value: string) => void
  onSubmit: (e: FormEvent) => void | Promise<void>
  onDelete: (progressId: string) => void | Promise<void>
}
