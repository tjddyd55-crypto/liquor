import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormTextarea, FormButton } from '../../../components/form'
import { Button } from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { customerRecordToUpdatePayload, updateCustomer } from '../api/customersApi'
import type { CustomerNote, CustomerNotesBag, CustomerRecord } from '../domain/types'
import { customerNoteItems, normalizeCustomerNotesBag } from '../domain/types'
import { NOTE_MAX_LENGTH } from '../utils/insuranceInfo'

function makePendingMemoId(): string {
  return `pending:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

type Props = {
  customer: CustomerRecord
  token: string | null
  showFileShortcut?: boolean
  onOpenFilesModal?: (customerId: number) => void
  onOpenConsultationsModal?: (customerId: number) => void
  onOpenAutoModal?: (customerId: number) => void
  onOpenGaModal?: (customerId: number) => void
  onPersisted: (customerId: number, newMemo: CustomerNotesBag) => void | Promise<void>
  onStatusMessage: (msg: string) => void
  /** 메모 줄에서 플랫폼 할 일 초안 생성 */
  onAddTodoFromMemo?: (payload: { noteId: string; memoText: string }) => void
  /** 모바일 고객 메모 전용 화면: 구분선을 다크 테마 토큰에 맞춤 */
  workspaceMobileMemo?: boolean
}

export const CustomerInlineNotesSection = memo(function CustomerInlineNotesSection({
  customer,
  token,
  showFileShortcut = true,
  onOpenFilesModal,
  onOpenConsultationsModal,
  onOpenAutoModal,
  onOpenGaModal,
  onPersisted,
  onStatusMessage,
  onAddTodoFromMemo,
  workspaceMobileMemo = false,
}: Props) {
  const [memoOpen, setMemoOpen] = useState(false)
  const [draft, setDraft] = useState('')
  /** 상담 목록(rows)과 같이 메모만 별도 state — 타이핑·낙관적 반영은 여기서만 처리 */
  const [memos, setMemos] = useState<CustomerNote[]>(() => customerNoteItems(customer))
  const [saving, setSaving] = useState(false)
  const savingLock = useRef(false)

  const serverNotesSignature = useMemo(() => {
    const bag = normalizeCustomerNotesBag(customer.notes)
    return `${customer.id}|${JSON.stringify(bag)}`
  }, [customer.id, customer.notes])

  useEffect(() => {
    setMemos(customerNoteItems(customer))
  }, [serverNotesSignature, customer])

  const { confirm, confirmDialog } = useConfirmDialog()

  const insuranceHistory = normalizeCustomerNotesBag(customer.notes).insuranceHistory

  const sortedItems = useMemo(() => {
    return [...memos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [memos])

  const closeMemoModal = useCallback(() => {
    setDraft('')
    setMemoOpen(false)
  }, [])

  const requestCloseMemoModal = useCallback(async () => {
    if (!draft.trim()) {
      closeMemoModal()
      return
    }
    const ok = await confirm({
      title: '메모 입력',
      message: '작성 중인 내용이 있습니다. 닫을까요?',
      confirmLabel: '닫기',
      cancelLabel: '계속 작성',
      tone: 'warning',
    })
    if (ok) {
      closeMemoModal()
    }
  }, [closeMemoModal, confirm, draft])

  function openMemoModal() {
    setDraft('')
    setMemoOpen(true)
  }

  async function commitNotesToServer(nextItems: CustomerNote[], rollback: () => void) {
    if (!token?.trim()) {
      rollback()
      return
    }
    if (!Number.isFinite(customer.id) || customer.id < 1) {
      onStatusMessage('고객 정보가 올바르지 않습니다.')
      rollback()
      return
    }
    onStatusMessage('')
    try {
      const notesBag: CustomerNotesBag = {
        items: nextItems,
        insuranceHistory: insuranceHistory.trim(),
      }
      const payload = customerRecordToUpdatePayload(customer, notesBag)
      const returned = await updateCustomer(token, customer.id, payload)
      const bag = normalizeCustomerNotesBag(returned.notes)
      setMemos(customerNoteItems({ notes: returned.notes }))
      await Promise.resolve(onPersisted(returned.id, bag))
    } catch (e) {
      rollback()
      const msg = e instanceof Error ? e.message : '메모 저장에 실패했습니다.'
      onStatusMessage(msg)
    } finally {
      savingLock.current = false
      setSaving(false)
    }
  }

  function handleMemoSave() {
    if (savingLock.current) {
      return
    }
    const trimmed = draft.trim()
    if (!trimmed) {
      return
    }
    if (trimmed.length > NOTE_MAX_LENGTH) {
      onStatusMessage(`메모는 ${NOTE_MAX_LENGTH}자 이하로 입력해주세요.`)
      return
    }
    const tempId = makePendingMemoId()
    const optimistic: CustomerNote = {
      id: tempId,
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    const nextForApi = [optimistic, ...memos]

    savingLock.current = true
    setSaving(true)
    setMemos(nextForApi)
    closeMemoModal()

    void commitNotesToServer(nextForApi, () => {
      setMemos((prev) => prev.filter((m) => m.id !== tempId))
    })
  }

  function removeNote(id: string) {
    if (savingLock.current) {
      return
    }
    const snapshot = memos
    const nextForApi = snapshot.filter((n) => n.id !== id)

    savingLock.current = true
    setSaving(true)
    setMemos(nextForApi)

    void commitNotesToServer(nextForApi, () => {
      setMemos(snapshot)
    })
  }

  async function requestRemoveNote(id: string) {
    if (savingLock.current) {
      return
    }
    const ok = await confirm({
      title: '메모 삭제',
      message: (
        <>
          <p className="m-0 mb-2">메모를 삭제하시겠습니까?</p>
          <p className="m-0 text-sm text-[var(--text-secondary)]">삭제한 메모는 되돌릴 수 없습니다.</p>
        </>
      ),
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
    })
    if (!ok) {
      return
    }
    removeNote(id)
  }

  return (
    <div className="customer-inline-notes mt-5">
      <div className="flex justify-between items-center mb-2 gap-2">
        <div className="customer-section-title !mt-0">[메모]</div>
        <div className="flex items-center gap-2 shrink-0">
          {showFileShortcut ? (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs shrink-0"
              disabled={!token?.trim()}
              onClick={() => {
                if (onOpenFilesModal) {
                  onOpenFilesModal(customer.id)
                }
              }}
            >
              파일
            </Button>
          ) : null}
          {onOpenConsultationsModal ? (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs shrink-0"
              disabled={!token?.trim()}
              onClick={() => onOpenConsultationsModal?.(customer.id)}
            >
              상담
            </Button>
          ) : null}
          {onOpenAutoModal ? (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs shrink-0"
              disabled={!token?.trim()}
              onClick={() => onOpenAutoModal?.(customer.id)}
            >
              신청서
            </Button>
          ) : null}
          {onOpenGaModal ? (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs shrink-0"
              disabled={!token?.trim()}
              onClick={() => onOpenGaModal?.(customer.id)}
            >
              GA
            </Button>
          ) : null}
          {workspaceMobileMemo ? (
            <FormButton
              htmlType="button"
              variant="action"
              className="filter-button shrink-0"
              disabled={saving || !token?.trim()}
              onClick={openMemoModal}
            >
              메모 추가
            </FormButton>
          ) : (
            <Button
              type="button"
              variant="secondary"
              className="!px-3 !py-1.5 text-xs shrink-0"
              disabled={saving || !token?.trim()}
              onClick={openMemoModal}
            >
              메모 추가
            </Button>
          )}
        </div>
      </div>
      {sortedItems.length === 0 ? (
        <div className="text-sm text-[var(--text-secondary)] mt-2">등록된 내용이 없습니다.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '8px 0 0' }}>
          {sortedItems.map((note) => {
            return (
              <li
                key={note.id}
                className={`customer-inline-memo-row${workspaceMobileMemo ? ' customer-inline-memo-row--workspace-mobile' : ''}`}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  alignItems: 'flex-start',
                  ...(workspaceMobileMemo ? {} : { borderTop: '1px solid var(--border-subtle)' }),
                  padding: '12px 0',
                  fontSize: '0.9rem',
                }}
              >
                <div className="customer-inline-memo-row__body" style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{note.content}</div>
                  <small className="customer-inline-memo-row__meta block mt-1">
                    {new Date(note.createdAt).toLocaleString('ko-KR')}
                  </small>
                </div>
                <div style={{ flexShrink: 0, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  {onAddTodoFromMemo ? (
                    <FormButton
                      htmlType="button"
                      aria-label="할 일로 추가"
                      title="할 일로 추가"
                      disabled={saving}
                      style={{
                        flexShrink: 0,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: '#111827',
                        color: '#e5e7eb',
                        cursor: saving ? 'default' : 'pointer',
                        fontSize: '0.75rem',
                        lineHeight: 1,
                        padding: '4px 8px',
                        borderRadius: 6,
                        opacity: saving ? 0.5 : 1,
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddTodoFromMemo({ noteId: note.id, memoText: note.content })
                      }}
                    >
                      할 일로 추가
                    </FormButton>
                  ) : null}
                  <FormButton
                    htmlType="button"
                    aria-label="메모 삭제"
                    title="삭제"
                    disabled={saving}
                  style={{
                    flexShrink: 0,
                    border: 'none',
                    background: 'transparent',
                    cursor: saving ? 'default' : 'pointer',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                    padding: '2px 6px',
                    opacity: 0.75,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void requestRemoveNote(note.id)
                  }}
                >
                  ×
                </FormButton>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {/*
       * 입력 모달: 데이터 유실 방지를 위해 바깥(backdrop) 클릭으로 닫지 않는다.
       * 닫기는 저장 성공·취소·미저장 확인 후에만 수행한다.
       */}
      <Modal
        open={memoOpen}
        onClose={closeMemoModal}
        ariaLabel="메모 입력"
        closeOnBackdrop={false}
        onEscapeRequest={() => {
          void requestCloseMemoModal()
        }}
      >
        <div className="text-lg font-semibold mb-2 text-[var(--text-primary)]">메모 입력</div>
        <FormTextarea
          className="w-full border border-[var(--border-default)] rounded-lg p-2 mb-3 bg-[var(--bg-card)] text-[var(--text-primary)] box-border min-h-[120px]"
          value={draft}
          maxLength={NOTE_MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          placeholder="메모 내용"
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
        />
        <div className="flex gap-2 justify-end flex-wrap">
          <Button type="button" variant="secondary" onClick={() => void requestCloseMemoModal()}>
            취소
          </Button>
          <Button type="button" disabled={saving || !draft.trim()} onClick={handleMemoSave}>
            확인
          </Button>
        </div>
      </Modal>
      {confirmDialog}
    </div>
  )
})
