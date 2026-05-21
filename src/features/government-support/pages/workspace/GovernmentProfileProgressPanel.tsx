import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useConfirmDialog } from '../../../../components/dialog'
import { useAuth } from '../../../auth/AuthProvider'
import { localYmd } from '../../../customers/utils/consultationBodyFormat'
import {
  createGovProfileProgressEvent,
  deleteGovProfileProgressEvent,
  fetchGovProfileProgressEvents,
} from '../../api/governmentProfileProgressApi'
import { GOVERNMENT_APPLICATION_STATUSES } from '../../constants/governmentApplicationStatuses'
import type { GovProfileProgressEvent } from '../../types/governmentProfile.types'
import { buildGovernmentProfileProgressSummary } from '../../utils/governmentProfileProgressSummary'
import { useGovernmentProfileWorkspaceContext } from './governmentProfileWorkspaceContext'
import GovernmentProfileProgressPageMobile from './progress/GovernmentProfileProgressPageMobile'
import GovernmentProfileProgressPagePC from './progress/GovernmentProfileProgressPagePC'
import type { GovernmentProfileProgressViewProps } from './progress/governmentProfileProgressViewProps'

export default function GovernmentProfileProgressPanel() {
  const { profileId: profileIdParam } = useParams()
  const profileId = String(profileIdParam ?? '').trim()
  const { token } = useAuth()
  const ws = useGovernmentProfileWorkspaceContext()
  const profile = ws.selected
  const { confirm, confirmDialog } = useConfirmDialog()

  const [rows, setRows] = useState<GovProfileProgressEvent[]>([])
  const [status, setStatus] = useState(() => profile?.progressStatus ?? GOVERNMENT_APPLICATION_STATUSES[0])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [eventDate, setEventDate] = useState(() => localYmd())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const validId = profileId.length > 0

  const summary = useMemo(() => buildGovernmentProfileProgressSummary(profile), [profile])

  useEffect(() => {
    if (profile?.progressStatus) {
      setStatus(profile.progressStatus)
    }
  }, [profile?.progressStatus, profileId])

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
      const list = await fetchGovProfileProgressEvents(token, profileId, { limit: 100 })
      setRows(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.')
      setRows([])
    }
  }, [profileId, token, validId])

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  const onSubmitProgress = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim() || !validId) {
      return
    }
    const memo = content.trim()
    if (!memo) {
      setError('처리 메모를 입력해 주세요.')
      return
    }
    if (!status.trim()) {
      setError('접수 상태를 선택해 주세요.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await createGovProfileProgressEvent(token, profileId, {
        status: status.trim(),
        content: memo,
        title: title.trim() || undefined,
        eventDate,
      })
      setContent('')
      setTitle('')
      await loadAll()
      await ws.reloadProfiles()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  const onDeleteProgress = async (progressId: string) => {
    if (!token?.trim() || !validId) {
      return
    }
    const confirmed = await confirm({
      title: '진행 이력 삭제',
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
      await deleteGovProfileProgressEvent(token, profileId, progressId)
      setRows((prev) => prev.filter((item) => item.id !== progressId))
    } catch (err) {
      setError(err instanceof Error ? err.message : '삭제에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  if (!validId) {
    return (
      <div className="content-wrapper page-shell">
        <p>사업장을 먼저 선택해 주세요.</p>
      </div>
    )
  }

  const viewProps: GovernmentProfileProgressViewProps = {
    error,
    status,
    title,
    content,
    eventDate,
    busy,
    rows,
    summary,
    statusOptions: GOVERNMENT_APPLICATION_STATUSES,
    onSetStatus: setStatus,
    onSetTitle: setTitle,
    onSetContent: setContent,
    onSetEventDate: setEventDate,
    onSubmit: onSubmitProgress,
    onDelete: onDeleteProgress,
  }

  return (
    <>
      <ResponsiveLayout<GovernmentProfileProgressViewProps>
        PC={GovernmentProfileProgressPagePC}
        Mobile={GovernmentProfileProgressPageMobile}
        viewProps={viewProps}
      />
      {confirmDialog}
    </>
  )
}
