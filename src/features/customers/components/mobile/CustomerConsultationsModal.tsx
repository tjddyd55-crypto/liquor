import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useConfirmDialog } from '../../../../components/dialog'
import { FormButton } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import {
  createCustomerConsultation,
  deleteCustomerConsultation,
  listCustomerConsultations,
  type CustomerConsultationRow,
} from '../../api/customerExtraApi'
import CustomerConsultationsPageMobile from '../../pages/detail/CustomerConsultationsPageMobile'
import { localYmd } from '../../utils/consultationBodyFormat'
import { TodoEditorDialog, type TodoCreatePrefill } from '../../../todos/components/TodoEditorDialog'
import { firstLineTodoTitle } from '../../../todos/utils/todoCopy'
import { suggestDueDateFromText } from '../../../todos/utils/suggestDueDateFromText'

type CustomerConsultationsModalProps = {
  customerId: number
  onCreated?: (row: CustomerConsultationRow) => void
  /**
   * 삭제 성공 시 부모에게 알린다. 부모가 자체 목록을 캐싱하고 있다면 이 콜백으로
   * 동기화한다. 모달 내부 `rows` state 는 삭제 즉시 자체 제거한다.
   */
  onDeleted?: (consultId: number) => void
  onClose: () => void
}

export default function CustomerConsultationsModal({
  customerId,
  onCreated,
  onDeleted,
  onClose,
}: CustomerConsultationsModalProps) {
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token?.trim()) {
      setRows([])
      return
    }
    let cancelled = false
    setBusy(true)
    setError('')
    void listCustomerConsultations(token, customerId, { limit: 100 })
      .then((nextRows) => {
        if (!cancelled) {
          setRows(nextRows)
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setRows([])
          setError(loadError instanceof Error ? loadError.message : '상담 내역을 불러오지 못했습니다.')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setBusy(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [customerId, token])

  const handleSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault()
      if (!token?.trim()) {
        setError('로그인이 필요합니다.')
        return
      }
      const content = body.trim()
      if (!content) {
        setError('상담 내용을 입력해 주세요.')
        return
      }

      setBusy(true)
      setError('')
      try {
        const created = await createCustomerConsultation(token, customerId, content, {
          consultationDate: consultDate,
        })
        const nextRows = await listCustomerConsultations(token, customerId, { limit: 100 })
        setRows(nextRows)
        setBody('')
        onCreated?.(created)
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : '상담 저장에 실패했습니다.')
      } finally {
        setBusy(false)
      }
    },
    [body, consultDate, customerId, onCreated, token],
  )

  /*
   * 상담 항목 삭제.
   * 라우트 페이지(`CustomerConsultationsPage`) 의 onDeleteConsultation 와 동일한
   * UX 규칙을 따른다:
   *   1) `useConfirmDialog` 로 사용자 확인을 받는다.
   *   2) 서버에서 삭제에 성공한 경우에만 로컬 `rows` 에서 제거한다 (낙관적 갱신 금지).
   *   3) 실패 시 에러 메시지를 표시하고 목록은 그대로 둔다.
   * 모달 내부 목록은 재조회하지 않고 직접 필터링해 네트워크 비용을 아낀다
   * (`onDeleted` 콜백으로 부모에게도 알림 → 바깥 캐시 동기화 가능).
   */
  const handleDelete = useCallback(
    async (consultId: number) => {
      if (!token?.trim()) {
        setError('로그인이 필요합니다.')
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
        await deleteCustomerConsultation(token, customerId, consultId)
        setRows((prev) => prev.filter((item) => item.id !== consultId))
        onDeleted?.(consultId)
      } catch (deleteError) {
        setError(deleteError instanceof Error ? deleteError.message : '삭제에 실패했습니다.')
      } finally {
        setBusy(false)
      }
    },
    [confirm, customerId, onDeleted, token],
  )

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
        relatedEntityId: String(customerId),
        lockRelated: true,
      })
      setTodoDialogSession((k) => k + 1)
      setTodoDialogOpen(true)
    },
    [customerId],
  )

  /*
   * `confirmDialog` 는 `mobile-modal-overlay` **바깥** 형제로 렌더한다.
   *   - overlay 안에 두면 backdrop 클릭이 overlay(onClose) 로 버블돼 모달이
   *     닫히는 회귀 발생 (BaseDialog 자체에서 stopPropagation 을 걸어두긴 했지만
   *     이중 방어로 DOM 상으로도 분리한다).
   *   - overlay z-index(9999) 보다 BaseDialog z-index(10000) 가 높아야 하는 것은
   *     `BaseDialog.tsx` 쪽에서 보장한다.
   */
  return (
    <>
      <div className="mobile-modal-overlay" role="dialog" aria-modal="true" aria-label="상담" onClick={onClose}>
        <div className="mobile-modal" onClick={(e) => e.stopPropagation()}>
          <div className="mobile-modal-header">
            <span className="mobile-modal-header__spacer" aria-hidden />
            <span className="mobile-modal-header__title">상담</span>
            <FormButton htmlType="button" variant="action" className="mobile-btn mobile-btn--close" onClick={onClose}>
              닫기
            </FormButton>
          </div>
          <div className="mobile-modal-body">
            <div className="mobile-modal-content">
              <CustomerConsultationsPageMobile
                error={error}
                body={body}
                consultDate={consultDate}
                busy={busy}
                rows={rows}
                onSetBody={setBody}
                onSetConsultDate={setConsultDate}
                onSubmit={handleSubmit}
                onDelete={handleDelete}
                onAddTodoFromConsultation={openTodoFromConsultation}
              />
            </div>
          </div>
        </div>
      </div>
      <TodoEditorDialog
        open={todoDialogOpen}
        usePortal
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
      {confirmDialog}
    </>
  )
}
