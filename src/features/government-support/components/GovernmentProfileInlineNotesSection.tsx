import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormTextarea, FormButton } from '../../../components/form'
import { Button } from '../../../components/ui/Button'
import Modal from '../../../components/ui/Modal'
import {
  createGovProfileMemo,
  deleteGovProfileMemo,
} from '../api/governmentProfileMemosApi'
import { GOVERNMENT_PROFILE_MEMO_MAX_LENGTH } from '../constants/governmentProfileMemo.config'
import type { GovProfileMemo } from '../types/governmentProfile.types'

function makePendingMemoId(): string {
  return `pending:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

type Props = {
  profileId: string
  token: string | null
  memos: GovProfileMemo[]
  onMemosChange: (memos: GovProfileMemo[]) => void
  onStatusMessage: (msg: string) => void
  /** 메모 줄에서 플랫폼 할 일 초안 생성 */
  onAddTodoFromMemo?: (payload: { noteId: string; memoText: string }) => void
  /** 모바일 사업장 메모 전용 화면: 구분선을 다크 테마 토큰에 맞춤 */
  workspaceMobileMemo?: boolean
}

export const GovernmentProfileInlineNotesSection = memo(function GovernmentProfileInlineNotesSection({
  profileId,
  token,
  memos,
  onMemosChange,
  onStatusMessage,
  onAddTodoFromMemo,
  workspaceMobileMemo = false,
}: Props) {
  const [memoOpen, setMemoOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [localMemos, setLocalMemos] = useState<GovProfileMemo[]>(() => memos)
  const [saving, setSaving] = useState(false)
  const savingLock = useRef(false)

  const serverMemosSignature = useMemo(() => {
    return `${profileId}|${JSON.stringify(memos.map((m) => [m.id, m.content, m.updatedAt]))}`
  }, [profileId, memos])

  useEffect(() => {
    setLocalMemos(memos)
  }, [serverMemosSignature, memos])

  const { confirm, confirmDialog } = useConfirmDialog()

  const sortedItems = useMemo(() => {
    return [...localMemos].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }, [localMemos])

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

  async function commitCreateToServer(
    optimistic: GovProfileMemo,
    nextOptimisticList: GovProfileMemo[],
    rollback: () => void,
  ) {
    if (!token?.trim()) {
      rollback()
      return
    }
    if (!profileId.trim()) {
      onStatusMessage('사업장 정보가 올바르지 않습니다.')
      rollback()
      return
    }
    onStatusMessage('')
    try {
      const saved = await createGovProfileMemo(token, profileId, optimistic.content)
      const withoutPending = nextOptimisticList.filter((m) => m.id !== optimistic.id)
      const next = [saved, ...withoutPending]
      setLocalMemos(next)
      onMemosChange(next)
    } catch (e) {
      rollback()
      const msg = e instanceof Error ? e.message : '메모 저장에 실패했습니다.'
      onStatusMessage(msg)
    } finally {
      savingLock.current = false
      setSaving(false)
    }
  }

  async function commitDeleteToServer(memoId: string, snapshot: GovProfileMemo[], nextForApi: GovProfileMemo[]) {
    if (!token?.trim()) {
      setLocalMemos(snapshot)
      return
    }
    onStatusMessage('')
    try {
      await deleteGovProfileMemo(token, profileId, memoId)
      setLocalMemos(nextForApi)
      onMemosChange(nextForApi)
    } catch (e) {
      setLocalMemos(snapshot)
      const msg = e instanceof Error ? e.message : '메모 삭제에 실패했습니다.'
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
    if (trimmed.length > GOVERNMENT_PROFILE_MEMO_MAX_LENGTH) {
      onStatusMessage(`메모는 ${GOVERNMENT_PROFILE_MEMO_MAX_LENGTH}자 이하로 입력해주세요.`)
      return
    }
    const tempId = makePendingMemoId()
    const optimistic: GovProfileMemo = {
      id: tempId,
      profileId,
      ownerUserId: '',
      content: trimmed,
      createdByUserId: null,
      updatedByUserId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      archivedAt: null,
    }
    const nextForApi = [optimistic, ...localMemos]

    savingLock.current = true
    setSaving(true)
    setLocalMemos(nextForApi)
    closeMemoModal()

    void commitCreateToServer(optimistic, nextForApi, () => {
      setLocalMemos((prev) => prev.filter((m) => m.id !== tempId))
    })
  }

  function removeNote(id: string) {
    if (savingLock.current) {
      return
    }
    const snapshot = localMemos
    const nextForApi = snapshot.filter((n) => n.id !== id)

    savingLock.current = true
    setSaving(true)
    setLocalMemos(nextForApi)

    void commitDeleteToServer(id, snapshot, nextForApi)
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
          maxLength={GOVERNMENT_PROFILE_MEMO_MAX_LENGTH}
          onChange={(e) => setDraft(e.target.value.slice(0, GOVERNMENT_PROFILE_MEMO_MAX_LENGTH))}
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
