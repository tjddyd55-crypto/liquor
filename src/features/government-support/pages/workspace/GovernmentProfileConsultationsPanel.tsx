import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useConfirmDialog } from '../../../../components/dialog'
import { useAuth } from '../../../auth/AuthProvider'
import { TodoEditorDialog, type TodoCreatePrefill } from '../../../todos/components/TodoEditorDialog'
import { firstLineTodoTitle } from '../../../todos/utils/todoCopy'
import { suggestDueDateFromText } from '../../../todos/utils/suggestDueDateFromText'
import { localYmd } from '../../../customers/utils/consultationBodyFormat'
import {
  createGovProfileConsultation,
  deleteGovProfileConsultation,
  fetchGovProfileConsultations,
} from '../../api/governmentProfileConsultationsApi'
import type { GovProfileConsultation } from '../../types/governmentProfile.types'
import { useGovernmentProfileWorkspaceContext } from './governmentProfileWorkspaceContext'
import GovernmentProfileConsultationsPageMobile from './consultations/GovernmentProfileConsultationsPageMobile'
import GovernmentProfileConsultationsPagePC from './consultations/GovernmentProfileConsultationsPagePC'
import type { GovernmentProfileConsultationsViewProps } from './consultations/governmentProfileConsultationsViewProps'

export default function GovernmentProfileConsultationsPanel() {
  const { profileId: profileIdParam } = useParams()
  const profileId = String(profileIdParam ?? '').trim()
  const { token, user } = useAuth()
  const ws = useGovernmentProfileWorkspaceContext()
  const profile = ws.selected
  const gaIdNumeric =
    user?.gaId != null && Number.isFinite(Number(user.gaId)) ? Number(user.gaId) : null
  const { confirm, confirmDialog } = useConfirmDialog()

  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [todoDialogSession, setTodoDialogSession] = useState(0)
  const [todoPrefill, setTodoPrefill] = useState<TodoCreatePrefill | null>(null)
  const [rows, setRows] = useState<GovProfileConsultation[]>([])
  const [body, setBody] = useState('')
  const [consultDate, setConsultDate] = useState(() => localYmd())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const validId = profileId.length > 0

  useEffect(() => {
    if (!token?.trim() || !validId) {
      return
    }
    setRows([])
  }, [profileId, token, validId])

  const loadAll = useCallback(async () => {
    if (!token?.trim() || !validId) {
      return
    }
    setError('')
    try {
      const list = await fetchGovProfileConsultations(token, profileId, { limit: 100 })
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
      setRows([])
    }
  }, [profileId, token, validId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const onSubmitConsultation = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim() || !validId) {
      return
    }
    const t = body.trim()
    if (!t) {
      setError('상담 내용을 입력해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createGovProfileConsultation(token, profileId, t, { consultationDate: consultDate })
      setBody('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteConsultation = async (consultId: string) => {
    if (!token?.trim() || !validId) {
      return
    }
    const confirmed = await confirm({
      title: '상담 삭제',
      message: '정말 삭제하시겠습니까?',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setBusy(true)
    setError('')
    try {
      await deleteGovProfileConsultation(token, profileId, consultId)
      setRows((prev) => prev.filter((item) => item.id !== consultId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const openTodoFromConsultation = useCallback(
    (consultId: string, plainBody: string) => {
      const bodyText = plainBody.trim() || '(상담 내용 없음)'
      setTodoPrefill({
        sourceType: 'consultation_note',
        sourceId: consultId,
        title: firstLineTodoTitle(bodyText),
        description: bodyText,
        dueDate: suggestDueDateFromText(bodyText),
        relatedEntityType: 'customer',
        relatedEntityId: profileId,
        lockRelated: true,
        lockedCustomerSummary: profile?.customerName ?? profile?.businessName,
      })
      setTodoDialogSession((k) => k + 1)
      setTodoDialogOpen(true)
    },
    [profile?.businessName, profile?.customerName, profileId],
  )

  if (!validId) {
    return (
      <div className="content-wrapper page-shell">
        <p>사업장을 먼저 선택해 주세요.</p>
      </div>
    )
  }

  const viewProps: GovernmentProfileConsultationsViewProps = {
    error,
    body,
    consultDate,
    busy,
    rows,
    onSetBody: setBody,
    onSetConsultDate: setConsultDate,
    onSubmit: onSubmitConsultation,
    onDelete: onDeleteConsultation,
    onAddTodoFromConsultation: gaIdNumeric != null ? openTodoFromConsultation : undefined,
  }

  return (
    <>
      <ResponsiveLayout<GovernmentProfileConsultationsViewProps>
        PC={GovernmentProfileConsultationsPagePC}
        Mobile={GovernmentProfileConsultationsPageMobile}
        viewProps={viewProps}
      />
      {gaIdNumeric != null ? (
        <TodoEditorDialog
          open={todoDialogOpen}
          onClose={() => {
            setTodoDialogOpen(false)
            setTodoPrefill(null)
          }}
          token={token ?? ''}
          gaId={gaIdNumeric}
          sessionKey={todoDialogSession}
          prefill={todoPrefill}
          onCommitted={() => {}}
        />
      ) : null}
      {confirmDialog}
    </>
  )
}
