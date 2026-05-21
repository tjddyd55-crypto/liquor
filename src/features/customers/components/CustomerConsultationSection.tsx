import { type CSSProperties, type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormInput, FormTextarea, FormButton } from '../../../components/form'
import { Button } from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import { ApiError } from '../../../lib/apiClient'
import {
  createCustomerConsultation,
  deleteCustomerConsultation,
  listCustomerConsultations,
  type CustomerConsultationRow,
} from '../api/customerExtraApi'
import { localYmd, parseConsultationStoredBody } from '../utils/consultationBodyFormat'

const CONSULT_PREVIEW_LIMIT = 80
const CONTENT_MAX = 19500

type Props = {
  customerId: number
  token: string
  onMutated?: () => void
}

export function CustomerConsultationSection({ customerId, token, onMutated }: Props) {
  const [rows, setRows] = useState<CustomerConsultationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [listError, setListError] = useState('')
  const [modalError, setModalError] = useState('')
  const [consultModalOpen, setConsultModalOpen] = useState(false)
  const [consultDate, setConsultDate] = useState(() => localYmd())
  const [draft, setDraft] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const latestRef = useRef<HTMLLIElement | null>(null)
  const pendingScrollRef = useRef(false)
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null)
  const consultModalBaselineRef = useRef({ date: '' })
  const { confirm, confirmDialog } = useConfirmDialog()

  const fetchPage = useCallback(
    async (startOffset: number, append: boolean) => {
      if (!token?.trim()) {
        return
      }
      setLoading(true)
      setListError('')
      try {
        const page = await listCustomerConsultations(token, customerId, {
          limit: CONSULT_PREVIEW_LIMIT,
          offset: startOffset,
        })
        setHasMore(page.length === CONSULT_PREVIEW_LIMIT)
        if (append) {
          setRows((prev) => [...prev, ...page])
        } else {
          setRows(page)
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setListError('')
          setHasMore(false)
          if (!append) {
            setRows([])
          }
        } else {
          setListError(e instanceof Error ? e.message : '상담 목록을 불러오지 못했습니다.')
          if (!append) {
            setRows([])
          }
        }
      } finally {
        setLoading(false)
      }
    },
    [token, customerId],
  )

  useEffect(() => {
    setHasMore(false)
    void fetchPage(0, false)
  }, [customerId, fetchPage])

  useEffect(() => {
    if (!pendingScrollRef.current || rows.length === 0) {
      return
    }
    pendingScrollRef.current = false
    window.requestAnimationFrame(() => {
      latestRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [rows])

  useEffect(() => {
    if (!consultModalOpen) {
      setDraft('')
      setConsultDate(localYmd())
      setModalError('')
    }
  }, [consultModalOpen])

  function openConsultModal() {
    const today = localYmd()
    consultModalBaselineRef.current = { date: today }
    setModalError('')
    setConsultDate(today)
    setDraft('')
    setConsultModalOpen(true)
  }

  const requestCloseConsultModal = useCallback(async () => {
    const dirty =
      draft.trim().length > 0 || consultDate !== consultModalBaselineRef.current.date
    if (!dirty) {
      setConsultModalOpen(false)
      return
    }
    const ok = await confirm({
      title: '상담 입력',
      message: '작성 중인 내용이 있습니다. 닫을까요?',
      confirmLabel: '닫기',
      cancelLabel: '계속 작성',
      tone: 'warning',
    })
    if (ok) {
      setConsultModalOpen(false)
    }
  }, [confirm, consultDate, draft])

  const onModalSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const content = draft.trim()
    if (!content) {
      setModalError('상담 내용을 입력해 주세요.')
      return
    }
    if (content.length > CONTENT_MAX) {
      setModalError(`내용은 ${CONTENT_MAX}자 이하로 입력해 주세요.`)
      return
    }
    if (!token?.trim()) {
      return
    }
    const dateToUse = consultDate.trim() || localYmd()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateToUse)) {
      setModalError('상담 일자를 다시 선택해 주세요.')
      return
    }
    setSaving(true)
    setModalError('')
    try {
      await createCustomerConsultation(token, customerId, content, { consultationDate: dateToUse })
      setConsultModalOpen(false)
      setDraft('')
      setConsultDate(localYmd())
      pendingScrollRef.current = true
      await fetchPage(0, false)
      onMutated?.()
    } catch (err) {
      setModalError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const onDelete = async (row: CustomerConsultationRow) => {
    if (!token?.trim()) {
      return
    }
    setListError('')
    try {
      await deleteCustomerConsultation(token, customerId, row.id)
      await fetchPage(0, false)
      onMutated?.()
    } catch (err) {
      setListError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    }
  }

  const compactBtn: CSSProperties = {
    fontSize: '0.875rem',
    padding: '4px 10px',
    minHeight: 0,
  }

  return (
    <div className="customer-form-history customer-consultation-block mt-5">
      <div className="flex justify-between items-center mb-2 gap-2">
        <div className="customer-section-title !mt-0">[상담 내역]</div>
        <Button
          type="button"
          variant="secondary"
          className="!px-3 !py-1.5 text-xs shrink-0"
          disabled={!token?.trim()}
          onClick={openConsultModal}
        >
          상담 추가
        </Button>
      </div>

      {listError && !consultModalOpen ? (
        <p style={{ color: '#b00020', margin: '0 0 8px', fontSize: '0.9rem' }} role="alert">
          {listError}
        </p>
      ) : null}

      {loading && rows.length === 0 ? (
        <p className="customer-form-history__status">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="text-sm text-[var(--text-secondary)] mt-2">등록된 내용이 없습니다.</div>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {rows.map((r, idx) => {
            const { dateLabel, text } = parseConsultationStoredBody(
              r.body,
              r.createdAt,
              r.consultationDate ?? null,
            )
            return (
              <li
                key={r.id}
                ref={idx === 0 ? latestRef : undefined}
                style={{
                  borderBottom: '1px solid rgba(0,0,0,0.08)',
                  padding: '12px 0',
                  display: 'flex',
                  gap: 8,
                  alignItems: 'flex-start',
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    flexShrink: 0,
                    minWidth: '7.5rem',
                  }}
                >
                  ● {dateLabel}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.95rem',
                    wordBreak: 'break-word',
                  }}
                >
                  {text || '—'}
                </div>
                <FormButton
                  htmlType="button"
                  aria-label="상담 삭제"
                  title="삭제"
                  style={{
                    flexShrink: 0,
                    padding: '2px 8px',
                    fontSize: '1.1rem',
                    lineHeight: 1,
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    opacity: 0.8,
                  }}
                  onClick={() => void onDelete(r)}
                >
                  ×
                </FormButton>
              </li>
            )
          })}
        </ul>
      )}

      {hasMore ? (
        <FormButton
          htmlType="button"
          className="filter-button"
          style={{ marginTop: 10, ...compactBtn }}
          disabled={loading}
          onClick={() => void fetchPage(rows.length, true)}
        >
          {loading ? '불러오는 중…' : '이전 상담 더 보기'}
        </FormButton>
      ) : null}

      <Modal
        open={consultModalOpen}
        onClose={() => setConsultModalOpen(false)}
        ariaLabel="상담 입력"
        initialFocusRef={draftTextareaRef}
        closeOnBackdrop={false}
        onEscapeRequest={() => {
          void requestCloseConsultModal()
        }}
      >
        <div className="text-lg font-semibold mb-2 text-[var(--text-primary)]">상담 입력</div>
        <form onSubmit={(ev) => void onModalSubmit(ev)}>
          <div className="mb-2">
            <FormInput
              type="date"
              className="field__control w-full box-border"
              value={consultDate}
              onChange={(e) => setConsultDate(e.target.value)}
              aria-label="상담 일자"
            />
            <p className="text-[var(--text-secondary)] text-xs mt-1 mb-0">
              비워 두면 오늘 날짜로 저장됩니다.
            </p>
          </div>
          <FormTextarea
            ref={draftTextareaRef}
            className="field__control w-full box-border min-h-[120px] mb-2"
            rows={4}
            value={draft}
            maxLength={CONTENT_MAX}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="상담 내용 (줄바꿈 유지)"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
          {modalError ? (
            <p className="text-[var(--danger)] text-sm mb-2" role="alert">
              {modalError}
            </p>
          ) : null}
          <div className="flex gap-2 justify-end flex-wrap">
            <Button type="button" variant="secondary" onClick={() => void requestCloseConsultModal()}>
              취소
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? '저장 중…' : '확인'}
            </Button>
          </div>
        </form>
      </Modal>
      {confirmDialog}
    </div>
  )
}
