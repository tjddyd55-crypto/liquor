import { useCallback, useEffect, useRef, useState } from 'react'
import { BaseDialog } from '../../../components/dialog/BaseDialog'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import { ApiError } from '../../../lib/apiClient'
import { searchCustomers } from '../../customers/api/customersApi'
import type { CustomerRecord } from '../../customers/domain/types'
import type { TodoDto, TodoPriority, TodoSourceType } from '../domain/todoTypes'
import { createTodo, deleteTodo, patchTodo } from '../api/todosApi'
import { formatSeoulYmd } from '../utils/formatSeoulYmd'
import { suggestDueDateFromText } from '../utils/suggestDueDateFromText'

const MIN_SEARCH = 2

export type TodoCreatePrefill = {
  sourceType: TodoSourceType
  sourceId?: string | null
  title: string
  description: string
  dueDate?: string | null
  relatedEntityType?: 'customer' | null
  relatedEntityId?: string | null
  lockRelated?: boolean
  lockedCustomerSummary?: string
}

type Mode = 'create' | 'edit'

type Props = {
  open: boolean
  onClose: () => void
  token: string
  gaId: number | null
  prefill?: TodoCreatePrefill | null
  editingTodo?: TodoDto | null
  usePortal?: boolean
  /** 열림 세션당 증가 — 동일 고객에서 연속으로 띄울 때 폼 리셋 */
  sessionKey?: number
  onCommitted?: () => void
}

function priorityOptions() {
  return [
    { value: 'low', label: '낮음' },
    { value: 'normal', label: '보통' },
    { value: 'high', label: '높음' },
  ]
}

export function TodoEditorDialog({
  open,
  onClose,
  token,
  gaId,
  prefill,
  editingTodo,
  usePortal = false,
  sessionKey = 0,
  onCommitted,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()

  const mode: Mode = editingTodo ? 'edit' : 'create'

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [priority, setPriority] = useState<TodoPriority>('normal')
  const [relatedEntityType, setRelatedEntityType] = useState('')
  const [relatedEntityId, setRelatedEntityId] = useState('')
  const [searchQ, setSearchQ] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchHits, setSearchHits] = useState<CustomerRecord[]>([])
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)
  const touchedRef = useRef(false)

  const nestedConfirmBlockingRef = useRef(false)

  const lockRelated = mode === 'create' ? Boolean(prefill?.lockRelated) : false
  const lockedCustomerSummary =
    mode === 'create' ? String(prefill?.lockedCustomerSummary ?? '').trim() : ''

  const resetFromEditing = useCallback((row: TodoDto) => {
    setTitle(row.title)
    setDescription(row.description ?? '')
    setDueDate(row.dueDate ?? '')
    setDueTime(row.dueTime ?? '')
    setPriority(row.priority ?? 'normal')
    setRelatedEntityType(row.relatedEntityType ?? '')
    setRelatedEntityId(row.relatedEntityId ?? '')
    setSearchQ('')
    setSearchHits([])
    setFormError('')
  }, [])

  const resetFromPrefill = useCallback((pf: TodoCreatePrefill) => {
    const suggested =
      pf.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(pf.dueDate)
        ? pf.dueDate
        : suggestDueDateFromText(`${pf.title}\n${pf.description}`)
    setTitle(pf.title)
    setDescription(pf.description)
    setDueDate(suggested ?? '')
    setDueTime('')
    setPriority('normal')
    if (pf.lockRelated && pf.relatedEntityType === 'customer' && pf.relatedEntityId) {
      setRelatedEntityType('customer')
      setRelatedEntityId(pf.relatedEntityId)
    } else {
      setRelatedEntityType('')
      setRelatedEntityId('')
    }
    setSearchQ('')
    setSearchHits([])
    setFormError('')
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    touchedRef.current = false
    if (mode === 'edit' && editingTodo) {
      resetFromEditing(editingTodo)
    } else if (prefill) {
      resetFromPrefill(prefill)
    } else {
      setTitle('')
      setDescription('')
      setDueDate('')
      setDueTime('')
      setPriority('normal')
      setRelatedEntityType('')
      setRelatedEntityId('')
      setSearchQ('')
      setSearchHits([])
      setFormError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sessionKey·id로 열림 경계만 리셋
  }, [open, sessionKey, editingTodo?.id, mode, prefill, resetFromEditing, resetFromPrefill])

  useEffect(() => {
    if (!open || !token?.trim()) {
      return
    }
    const q = searchQ.trim()
    if (lockRelated || q.length < MIN_SEARCH) {
      setSearchHits([])
      return
    }
    let cancelled = false
    setSearchBusy(true)
    const t = window.setTimeout(() => {
      void searchCustomers(token, q, { scopeGaId: gaId })
        .then((rows) => {
          if (!cancelled) {
            setSearchHits(rows.slice(0, 15))
          }
        })
        .catch(() => {
          if (!cancelled) setSearchHits([])
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false)
        })
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [open, token, gaId, searchQ, lockRelated])

  const suggestFromDescription = () => {
    touchedRef.current = true
    const s = suggestDueDateFromText(`${title}\n${description}`)
    if (s && !dueDate) {
      setDueDate(s)
    }
  }

  const handleRequestClose = useCallback(async () => {
    if (nestedConfirmBlockingRef.current) {
      return
    }
    if (touchedRef.current) {
      nestedConfirmBlockingRef.current = true
      const ok = await confirm({
        title: '닫기',
        message: '변경사항이 저장되지 않았습니다. 닫으시겠습니까?',
        confirmLabel: '닫기',
      })
      nestedConfirmBlockingRef.current = false
      if (!ok) return
    }
    onClose()
  }, [confirm, onClose])

  async function submit() {
    if (!token?.trim()) {
      return
    }
    const t = title.trim()
    if (!t) {
      setFormError('제목을 입력해 주세요.')
      return
    }
    setBusy(true)
    setFormError('')
    try {
      if (mode === 'edit' && editingTodo) {
        await patchTodo(token, editingTodo.id, {
          title: t,
          description,
          dueDate: dueDate.trim() || null,
          dueTime: dueTime.trim() || null,
          priority,
          relatedEntityType: relatedEntityType.trim() || null,
          relatedEntityId: relatedEntityType.trim() && relatedEntityId.trim() ? relatedEntityId.trim() : null,
        })
      } else {
        const st: TodoSourceType = prefill?.sourceType ?? 'manual'
        await createTodo(token, {
          sourceType: st,
          sourceId: prefill?.sourceId ?? undefined,
          title: t,
          description,
          dueDate: dueDate.trim() || null,
          dueTime: dueTime.trim() || null,
          priority,
          relatedEntityType: relatedEntityType.trim() ? relatedEntityType.trim() : null,
          relatedEntityId:
            relatedEntityType.trim() && relatedEntityId.trim() ? relatedEntityId.trim() : null,
        })
      }
      onCommitted?.()
      onClose()
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : '저장에 실패했습니다.'
      setFormError(msg)
    } finally {
      setBusy(false)
    }
  }

  async function onDelete() {
    if (!token?.trim() || !editingTodo) return
    const ok = await confirm({
      title: '할 일 삭제',
      message: '삭제 후에는 복구할 수 없습니다. 계속하시겠습니까?',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    setBusy(true)
    setFormError('')
    try {
      await deleteTodo(token, editingTodo.id)
      onCommitted?.()
      onClose()
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : '삭제에 실패했습니다.'
      setFormError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <BaseDialog
        open={open}
        onClose={() => void handleRequestClose()}
        ariaLabel={mode === 'edit' ? '할 일 수정' : '할 일 추가'}
        panelPreset="largeForm"
        closeOnBackdrop={false}
        closeOnHistoryBack
        usePortal={usePortal}
        onEscapeRequest={() => void handleRequestClose()}
      >
        <div className="flex flex-col flex-1 min-h-0 text-[var(--text-primary)]">
          <header className="flex-shrink-0 border-b border-[var(--border-default)] px-4 py-3">
            <h2 className="text-lg font-semibold m-0">{mode === 'edit' ? '할 일 수정' : '할 일 추가'}</h2>
          </header>
          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
            {formError ? (
              <p className="text-sm text-[var(--danger,#ef4444)] m-0" role="alert">
                {formError}
              </p>
            ) : null}
            <label className="flex flex-col gap-1 dark-label">
              <span>제목</span>
              <FormInput
                value={title}
                onChange={(e) => {
                  touchedRef.current = true
                  setTitle(e.target.value)
                }}
                maxLength={500}
                disabled={busy}
              />
            </label>
            <label className="flex flex-col gap-1 dark-label">
              <span>설명 / 메모</span>
              <FormTextarea
                value={description}
                rows={5}
                onChange={(e) => {
                  touchedRef.current = true
                  setDescription(e.target.value.slice(0, 20000))
                }}
                disabled={busy}
              />
              <button
                type="button"
                className="text-xs text-[#60a5fa] underline self-start bg-transparent border-none cursor-pointer"
                disabled={busy}
                onClick={suggestFromDescription}
              >
                본문에서 오늘/내일/모레 키워드로 마감일 제안
              </button>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 dark-label">
                <span>마감일</span>
                <FormInput
                  type="date"
                  value={dueDate}
                  onChange={(e) => {
                    touchedRef.current = true
                    setDueDate(e.target.value)
                  }}
                  disabled={busy}
                />
              </label>
              <label className="flex flex-col gap-1 dark-label">
                <span>마감 시간(선택)</span>
                <FormInput
                  type="time"
                  value={dueTime}
                  onChange={(e) => {
                    touchedRef.current = true
                    setDueTime(e.target.value)
                  }}
                  disabled={busy}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 dark-label max-w-xs">
              <span>우선순위</span>
              <FormSelect
                value={priority}
                onChange={(e) => {
                  touchedRef.current = true
                  setPriority(e.target.value as TodoPriority)
                }}
                options={priorityOptions()}
                disabled={busy}
              />
            </label>
            {mode === 'create' && lockRelated ? (
              <div className="rounded-lg border border-[#334155] bg-[#111827] p-3 text-sm">
                <div className="dark-label font-semibold mb-1">연결 대상</div>
                {relatedEntityType === 'customer' && relatedEntityId ? (
                  <div className="text-[#e5e7eb]">
                    고객{lockedCustomerSummary ? ` (${lockedCustomerSummary})` : ''} · ID {relatedEntityId}
                  </div>
                ) : (
                  <div className="text-[#94a3b8]">연결 없음</div>
                )}
              </div>
            ) : mode === 'edit' && editingTodo?.relatedEntityType === 'customer' && editingTodo.relatedEntityId ? (
              <div className="rounded-lg border border-[#334155] bg-[#111827] p-3 text-sm">
                <div className="dark-label font-semibold mb-1">연결 고객</div>
                <div className="text-[#e5e7eb]">
                  {editingTodo.customerName ? editingTodo.customerName : '고객'} · ID {editingTodo.relatedEntityId}
                </div>
              </div>
            ) : !lockRelated ? (
              <>
                <div className="dark-label font-semibold">연결 대상 — 고객 검색</div>
                <FormInput
                  value={searchQ}
                  placeholder={`이름/전화 ${MIN_SEARCH}글자 이상`}
                  onChange={(e) => {
                    touchedRef.current = true
                    setSearchQ(e.target.value)
                  }}
                  disabled={busy}
                />
                {searchBusy ? <p className="text-xs dark-muted m-0">검색 중…</p> : null}
                {searchHits.length > 0 ? (
                  <ul className="m-0 p-0 list-none space-y-1 max-h-40 overflow-y-auto rounded border border-[#334155] bg-[#020617]">
                    {searchHits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          disabled={busy}
                          className="w-full text-left px-2 py-1.5 text-sm text-[#e5e7eb] hover:bg-[#1f2937] bg-transparent border-none cursor-pointer"
                          onClick={() => {
                            touchedRef.current = true
                            setRelatedEntityType('customer')
                            setRelatedEntityId(String(c.id))
                            setSearchHits([])
                          }}
                        >
                          {c.name} · {c.phone || '—'}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {relatedEntityType === 'customer' && relatedEntityId ? (
                  <div className="text-sm text-[#94a3b8]">
                    선택됨 {relatedEntityType} · {relatedEntityId}
                    {' · '}
                    <button
                      type="button"
                      className="text-[#60a5fa] underline bg-transparent border-none cursor-pointer p-0"
                      disabled={busy}
                      onClick={() => {
                        touchedRef.current = true
                        setRelatedEntityType('')
                        setRelatedEntityId('')
                      }}
                    >
                      연결 해제
                    </button>
                  </div>
                ) : (
                  <p className="text-xs dark-muted m-0">연결하지 않아도 저장할 수 있습니다.</p>
                )}
              </>
            ) : null}
          </div>
          <footer className="flex-shrink-0 border-t border-[var(--border-default)] px-4 py-3 flex flex-wrap justify-between gap-2">
            <div>
              {mode === 'edit' ? (
                <FormButton htmlType="button" variant="danger" disabled={busy} onClick={() => void onDelete()}>
                  삭제
                </FormButton>
              ) : (
                <span />
              )}
            </div>
            <div className="flex gap-2">
              <FormButton variant="secondary" disabled={busy} onClick={() => void handleRequestClose()}>
                취소
              </FormButton>
              <FormButton variant="primary" disabled={busy} onClick={() => void submit()}>
                {busy ? '저장 중…' : '저장'}
              </FormButton>
            </div>
          </footer>
          <div className="text-xs text-[#64748b] px-4 pb-2">
            오늘(Asia/Seoul):{' '}
            <span className="text-[#94a3b8]">{formatSeoulYmd(new Date())}</span>
          </div>
        </div>
      </BaseDialog>
      {confirmDialog}
    </>
  )
}
