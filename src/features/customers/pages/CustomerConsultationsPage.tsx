import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton } from '../../../components/form'
import { ApiError } from '../../../lib/apiClient'
import { useAuth } from '../../auth/AuthProvider'
import {
  createCustomerConsultation,
  deleteCustomerConsultation,
  listCustomerConsultations,
  type CustomerConsultationRow,
} from '../api/customerExtraApi'
import { localYmd } from '../utils/consultationBodyFormat'
import CustomerConsultationsPageMobile from './detail/CustomerConsultationsPageMobile'
import CustomerConsultationsPagePC from './detail/CustomerConsultationsPagePC'
import type { CustomerConsultationsViewProps } from './detail/customerConsultationsViewProps'
import { TodoEditorDialog, type TodoCreatePrefill } from '../../todos/components/TodoEditorDialog'
import { firstLineTodoTitle } from '../../todos/utils/todoCopy'
import { suggestDueDateFromText } from '../../todos/utils/suggestDueDateFromText'

export default function CustomerConsultationsPage() {
  const { customerId } = useParams()
  const navigate = useNavigate()
  const resolvedCustomerId = Number(customerId)
  const { token, user } = useAuth()
  const gaIdNumeric =
    user?.gaId != null && Number.isFinite(Number(user.gaId)) ? Number(user.gaId) : null
  const { confirm, confirmDialog } = useConfirmDialog()

  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [todoDialogSession, setTodoDialogSession] = useState(0)
  const [todoPrefill, setTodoPrefill] = useState<TodoCreatePrefill | null>(null)
  const [rows, setRows] = useState<CustomerConsultationRow[]>([])
  const [body, setBody] = useState('')
  const [consultDate, setConsultDate] = useState(() => localYmd())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const validId = Number.isInteger(resolvedCustomerId) && resolvedCustomerId > 0

  useEffect(() => {
    if (!token?.trim() || !validId) {
      return
    }
    setRows([])
  }, [resolvedCustomerId, token, validId])

  const loadAll = useCallback(async () => {
    if (!token?.trim() || !validId) {
      return
    }
    setError('')
    setNotFound(false)
    try {
      const c = await listCustomerConsultations(token, resolvedCustomerId, { limit: 100 })
      setRows(c)
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setNotFound(true)
        setRows([])
        return
      }
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
    }
  }, [resolvedCustomerId, token, validId])

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
      await createCustomerConsultation(token, resolvedCustomerId, t, { consultationDate: consultDate })
      setBody('')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteConsultation = async (consultId: number) => {
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
      await deleteCustomerConsultation(token, resolvedCustomerId, consultId)
      setRows((prev) => prev.filter((item) => item.id !== consultId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const openTodoFromConsultation = useCallback(
    (consultId: number, plainBody: string) => {
      const bodyText = plainBody.trim() || '(상담 내용 없음)'
      setTodoPrefill({
        sourceType: 'consultation_note',
        sourceId: String(consultId),
        title: firstLineTodoTitle(bodyText),
        description: bodyText,
        dueDate: suggestDueDateFromText(bodyText),
        relatedEntityType: 'customer',
        relatedEntityId: String(resolvedCustomerId),
        lockRelated: true,
      })
      setTodoDialogSession((k) => k + 1)
      setTodoDialogOpen(true)
    },
    [resolvedCustomerId],
  )

  if (!validId) {
    return (
      <div className="content-wrapper page-shell">
        <p>잘못된 고객 ID입니다.</p>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="content-wrapper page-shell">
        <h1 style={{ marginTop: 12 }}>고객을 찾을 수 없음</h1>
        <p style={{ color: 'var(--text-secondary)' }}>삭제되었거나 접근할 수 없는 고객입니다.</p>
        <FormButton htmlType="button" variant="action" style={{ marginTop: 12 }} onClick={() => navigate('/customers')}>
          고객 목록으로
        </FormButton>
      </div>
    )
  }

  /*
   * View 분기는 `ResponsiveLayout<ViewProps>` 에 위임한다 (AGENTS §8-2 원칙 1).
   * 두 View 는 공통 `CustomerConsultationsViewProps` 시그니처를 공유하므로
   * container 는 `useIsMobile` 을 직접 호출하지 않는다.
   *
   * `confirmDialog` 는 `useConfirmDialog` 훅이 제공하는 포털 기반 다이얼로그이므로
   * View 와 같은 서브트리에 형제로 렌더해야 confirm 호출 시 정상 동작한다.
   */
  const viewProps: CustomerConsultationsViewProps = {
    error,
    body,
    consultDate,
    busy,
    rows,
    onSetBody: setBody,
    onSetConsultDate: setConsultDate,
    onSubmit: onSubmitConsultation,
    onDelete: onDeleteConsultation,
    onAddTodoFromConsultation: openTodoFromConsultation,
  }

  return (
    <>
      <ResponsiveLayout<CustomerConsultationsViewProps>
        PC={CustomerConsultationsPagePC}
        Mobile={CustomerConsultationsPageMobile}
        viewProps={viewProps}
      />
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
        onCommitted={() => {
          /* 목록 새로고침은 할 일 페이지에서 처리; 상담 화면은 그대로 */
        }}
      />
      {confirmDialog}
    </>
  )
}
