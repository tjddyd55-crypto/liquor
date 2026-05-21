import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FormButton } from '../../../../components/form'
import useIsMobile from '../../../../hooks/useIsMobile'
import { useAuth } from '../../../auth/AuthProvider'
import { TodoEditorDialog, type TodoCreatePrefill } from '../../../todos/components/TodoEditorDialog'
import { firstLineTodoTitle } from '../../../todos/utils/todoCopy'
import { suggestDueDateFromText } from '../../../todos/utils/suggestDueDateFromText'
import { fetchGovProfileMemos } from '../../api/governmentProfileMemosApi'
import { GovernmentProfileInlineNotesSection } from '../../components/GovernmentProfileInlineNotesSection'
import { useGovernmentProfileWorkspaceContext } from './governmentProfileWorkspaceContext'
import type { GovProfileMemo } from '../../types/governmentProfile.types'

export default function GovernmentProfileMemosPanel() {
  const { profileId: profileIdParam } = useParams()
  const profileId = String(profileIdParam ?? '').trim()
  const isMobile = useIsMobile()
  const { token, user } = useAuth()
  const ws = useGovernmentProfileWorkspaceContext()
  const profile = ws.selected
  const gaIdNumeric =
    user?.gaId != null && Number.isFinite(Number(user.gaId)) ? Number(user.gaId) : null
  const [memos, setMemos] = useState<GovProfileMemo[]>([])
  const [loading, setLoading] = useState(true)
  const [statusText, setStatusText] = useState('')
  const [memoTodoDialogOpen, setMemoTodoDialogOpen] = useState(false)
  const [memoTodoSession, setMemoTodoSession] = useState(0)
  const [memoTodoPrefill, setMemoTodoPrefill] = useState<TodoCreatePrefill | null>(null)

  const loadMemos = useCallback(async () => {
    if (!token?.trim() || !profileId) {
      setMemos([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const rows = await fetchGovProfileMemos(token, profileId)
      setMemos(rows)
      setStatusText('')
    } catch (error) {
      setMemos([])
      setStatusText(error instanceof Error ? error.message : '메모를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [profileId, token])

  useEffect(() => {
    void loadMemos()
  }, [loadMemos])

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
        relatedEntityId: profileId,
        lockRelated: true,
        lockedCustomerSummary: profile?.customerName,
      })
      setMemoTodoSession((k) => k + 1)
      setMemoTodoDialogOpen(true)
    },
    [profile?.customerName, profileId],
  )

  const memoSectionClassName = `customer-workspace-home${isMobile ? ' customer-memos-page--mobile' : ''}`

  if (!profileId) {
    const inner = (
      <section className={memoSectionClassName}>
        <h3 className="customer-workspace-home__title">사업장 메모</h3>
        <p className="customer-workspace-home__desc">사업장을 먼저 선택해 주세요.</p>
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
        <h3 className="customer-workspace-home__title">사업장 메모</h3>
        <p className="customer-workspace-home__desc">불러오는 중...</p>
      </section>
    )
    return isMobile ? (
      <div className="content-wrapper page-shell customer-memos-mobile-shell">{inner}</div>
    ) : (
      inner
    )
  }

  if (!token?.trim()) {
    const inner = (
      <section className={memoSectionClassName}>
        <h3 className="customer-workspace-home__title">사업장 메모</h3>
        <p className="customer-workspace-home__desc">{statusText || '로그인이 필요합니다.'}</p>
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
      <h3 className="customer-workspace-home__title">사업장 메모</h3>
      <p className="customer-workspace-home__desc">
        사업장 #{profileId} · {profile?.customerName || profile?.businessName || '-'}
      </p>
      <GovernmentProfileInlineNotesSection
        key={profileId}
        profileId={profileId}
        token={token}
        memos={memos}
        onMemosChange={setMemos}
        workspaceMobileMemo={isMobile}
        onStatusMessage={setStatusText}
        onAddTodoFromMemo={gaIdNumeric != null ? addTodoFromMemo : undefined}
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
      {gaIdNumeric != null ? (
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
      ) : null}
    </>
  )
}
