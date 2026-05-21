import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FormButton } from '../../../components/form'
import useIsMobile from '../../../hooks/useIsMobile'
import { useAuth } from '../../auth/AuthProvider'
import { TodoEditorDialog, type TodoCreatePrefill } from '../../todos/components/TodoEditorDialog'
import { firstLineTodoTitle } from '../../todos/utils/todoCopy'
import { suggestDueDateFromText } from '../../todos/utils/suggestDueDateFromText'
import { getCustomerById, type UpdateCustomerBody } from '../api/customersApi'
import { CustomerInlineNotesSection } from '../components/CustomerInlineNotesSection'
import type { CustomerNotesBag, CustomerRecord } from '../domain/types'

export default function CustomerMemosPage() {
  const { customerId: customerIdParam } = useParams()
  const customerId = Number(customerIdParam)
  const isMobile = useIsMobile()
  const { token, user } = useAuth()
  const gaIdNumeric =
    user?.gaId != null && Number.isFinite(Number(user.gaId)) ? Number(user.gaId) : null
  const [customer, setCustomer] = useState<CustomerRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [memoTodoDialogOpen, setMemoTodoDialogOpen] = useState(false)
  const [memoTodoSession, setMemoTodoSession] = useState(0)
  const [memoTodoPrefill, setMemoTodoPrefill] = useState<TodoCreatePrefill | null>(null)

  const loadCustomer = useCallback(async () => {
    if (!token?.trim() || !customerId || customerId < 1) {
      setCustomer(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const row = await getCustomerById(token, customerId)
      setCustomer(row)
      setStatusText('')
    } catch (error) {
      setCustomer(null)
      setStatusText(error instanceof Error ? error.message : '고객 정보를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [customerId, token])

  useEffect(() => {
    void loadCustomer()
  }, [loadCustomer])

  const addTodoFromMemo = useCallback(
    (payload: { noteId: string; memoText: string }) => {
      const txt = payload.memoText.trim() || '(메모 내용 없음)'
      setMemoTodoPrefill({
        sourceType: 'customer_memo',
        sourceId: payload.noteId,
        title: firstLineTodoTitle(txt),
        description: txt,
        dueDate: suggestDueDateFromText(txt),
        relatedEntityType: 'customer',
        relatedEntityId: String(customerId),
        lockRelated: true,
        lockedCustomerSummary: customer?.name,
      })
      setMemoTodoSession((k) => k + 1)
      setMemoTodoDialogOpen(true)
    },
    [customer?.name, customerId],
  )

  const memoSectionClassName = `customer-workspace-home${isMobile ? ' customer-memos-page--mobile' : ''}`

  if (!customerId || customerId < 1) {
    const inner = (
      <section className={memoSectionClassName}>
        <h3 className="customer-workspace-home__title">고객 메모</h3>
        <p className="customer-workspace-home__desc">고객을 먼저 선택해 주세요.</p>
      </section>
    )
    return isMobile ? (
      <div className="content-wrapper page-shell customer-memos-mobile-shell">{inner}</div>
    ) : (
      inner
    )
  }

  if (loading) {
    const inner = (
      <section className={memoSectionClassName}>
        <h3 className="customer-workspace-home__title">고객 메모</h3>
        <p className="customer-workspace-home__desc">불러오는 중...</p>
      </section>
    )
    return isMobile ? (
      <div className="content-wrapper page-shell customer-memos-mobile-shell">{inner}</div>
    ) : (
      inner
    )
  }

  if (!customer || !token?.trim()) {
    const inner = (
      <section className={memoSectionClassName}>
        <h3 className="customer-workspace-home__title">고객 메모</h3>
        <p className="customer-workspace-home__desc">{statusText || '고객 정보를 불러오지 못했습니다.'}</p>
        <FormButton htmlType="button" variant="action" className="filter-button" onClick={() => void loadCustomer()}>
          다시 시도
        </FormButton>
      </section>
    )
    return isMobile ? (
      <div className="content-wrapper page-shell customer-memos-mobile-shell">{inner}</div>
    ) : (
      inner
    )
  }

  const mainSection = (
    <section className={memoSectionClassName}>
      <h3 className="customer-workspace-home__title">고객 메모</h3>
      <p className="customer-workspace-home__desc">
        고객 #{customer.id} · {customer.name}
      </p>
      <CustomerInlineNotesSection
        key={customer.id}
        customer={customer}
        token={token}
        showFileShortcut={false}
        workspaceMobileMemo={isMobile}
        onPersisted={(customerIdFromNotes: number, newMemo: CustomerNotesBag) => {
          setCustomer((prev) => {
            if (!prev || prev.id !== customerIdFromNotes) {
              return prev
            }
            const nextNotes = newMemo as unknown as UpdateCustomerBody['notes']
            return { ...prev, notes: nextNotes }
          })
        }}
        onStatusMessage={setStatusText}
        onAddTodoFromMemo={addTodoFromMemo}
      />
      {statusText ? <p className="customer-workspace-home__selected">{statusText}</p> : null}
    </section>
  )

  return (
    <>
      {isMobile ? (
        <div className="content-wrapper page-shell customer-memos-mobile-shell">{mainSection}</div>
      ) : (
        mainSection
      )}
      <TodoEditorDialog
        open={memoTodoDialogOpen}
        onClose={() => {
          setMemoTodoDialogOpen(false)
          setMemoTodoPrefill(null)
        }}
        token={token}
        gaId={gaIdNumeric}
        sessionKey={memoTodoSession}
        prefill={memoTodoPrefill}
        onCommitted={() => {}}
      />
    </>
  )
}
