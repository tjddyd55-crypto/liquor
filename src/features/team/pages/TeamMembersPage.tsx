import { useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { EmptyState, LoadingState, StatusMessage } from '../../../components/feedback'
import { FormButton, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  disbandTeam,
  fetchTeamMembers,
  kickTeamMember,
  leaveTeam,
  transferTeamLeader,
  type TeamMemberRow,
} from '../api/teamApi'

export default function TeamMembersPage() {
  const { token, user, login } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [members, setMembers] = useState<TeamMemberRow[]>([])
  const [ownerId, setOwnerId] = useState<string | null>(null)
  const [teamActive, setTeamActive] = useState(true)
  const [transferTargetId, setTransferTargetId] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [pageLoading, setPageLoading] = useState(true)
  const [actionBusy, setActionBusy] = useState(false)

  const load = useCallback(async () => {
    if (!token?.trim()) {
      setPageLoading(false)
      return
    }
    setError('')
    try {
      const data = await fetchTeamMembers(token)
      setMembers(data.members)
      setOwnerId(data.ownerId ?? null)
      setTeamActive(data.teamActive ?? true)
      setTransferTargetId('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setPageLoading(false)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const iAmOwner = Boolean(ownerId && user?.id && ownerId === user.id)

  const otherMemberCount = useMemo(() => {
    if (!ownerId) {
      return 0
    }
    return members.filter((m) => m.userId !== ownerId).length
  }, [members, ownerId])

  const canDisband = iAmOwner && teamActive && otherMemberCount === 0

  const transferCandidates = useMemo(
    () => members.filter((m) => ownerId && m.userId !== ownerId),
    [members, ownerId],
  )

  const handleKick = async (memberUserId: string) => {
    if (!token?.trim() || !user) {
      return
    }
    const confirmed = await confirm({
      title: '팀원 강퇴',
      message: '강퇴하시겠습니까?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setActionBusy(true)
    setError('')
    setInfo('')
    try {
      await kickTeamMember(token, memberUserId)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '강퇴에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleTransferLeader = async () => {
    if (!token?.trim() || !user) {
      return
    }
    const id = String(transferTargetId ?? '').trim()
    if (!id) {
      setError('팀장을 위임할 팀원을 선택해 주세요.')
      return
    }
    const target = members.find((m) => m.userId === id)
    const label = target?.displayName || target?.username || '해당 팀원'
    const confirmed = await confirm({
      title: '팀장 위임',
      message: `${label}에게 팀장을 위임하시겠습니까?`,
      tone: 'warning',
    })
    if (!confirmed) {
      return
    }
    setActionBusy(true)
    setError('')
    setInfo('')
    try {
      await transferTeamLeader(token, id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '팀장 위임에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleDisband = async () => {
    if (!token?.trim() || !user) {
      return
    }
    const confirmed = await confirm({
      title: '팀 해체',
      message:
        '팀 게시글·첨부·팀 저장 파일이 정리되고 팀이 비활성화됩니다. 계속하시겠습니까?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setActionBusy(true)
    setError('')
    setInfo('')
    try {
      await disbandTeam(token)
      login({ token, user: { ...user, teamId: null } })
      setInfo('팀이 해체되었습니다.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '팀 해체에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  const handleLeave = async () => {
    if (!token?.trim() || !user) {
      return
    }
    const aloneLeader = iAmOwner && otherMemberCount === 0
    const confirmed = await confirm({
      title: aloneLeader ? '팀 나가기 (팀 해체)' : '팀 나가기',
      message: aloneLeader
        ? '팀원이 없어 팀이 해체되며, 저장소가 정리됩니다. 계속하시겠습니까?'
        : '팀에서 나가시겠습니까?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setActionBusy(true)
    setError('')
    setInfo('')
    try {
      const result = await leaveTeam(token)
      login({ token, user: { ...user, teamId: null } })
      setInfo(result.disbanded ? '팀이 해체되었습니다.' : '팀에서 나갔습니다')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : '팀 나가기에 실패했습니다.')
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="content-wrapper page-shell">
      <h1 className="text-[var(--text-primary)]" style={{ marginTop: 12 }}>
        팀 관리 (팀원 관리)
      </h1>
      <p className="text-sm text-[var(--text-secondary)]" style={{ marginTop: 6 }}>
        팀원 목록과 강퇴·팀장 위임·팀 해체·나가기를 관리합니다.
      </p>

      <StatusMessage message={error} tone="error" className="mt-2" />
      <StatusMessage message={info} tone="success" className="mt-2" />

      {pageLoading ? (
        <LoadingState className="mt-3 text-left text-sm text-[var(--text-secondary)]" />
      ) : members.length === 0 ? (
        <EmptyState message="팀이 없습니다" className="mt-4 text-left text-sm text-[var(--text-secondary)]" />
      ) : (
        <>
          {!teamActive ? (
            <p className="mt-3 text-sm text-amber-500">이 팀은 비활성(해체) 상태입니다.</p>
          ) : null}

          {iAmOwner && teamActive ? (
            <div className="mt-3 flex flex-col gap-2 border border-[var(--border-default)] rounded-md p-3 bg-[var(--surface-elevated)]">
              <p className="text-xs text-[var(--text-secondary)]">팀장 전용</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1 min-w-[12rem] flex-1">
                  <label htmlFor="transfer-target" className="text-xs text-[var(--text-secondary)]">
                    팀장 위임 대상
                  </label>
                  <FormSelect
                    id="transfer-target"
                    className="text-sm rounded border border-[var(--border-default)] bg-[var(--surface-base)] text-[var(--text-primary)] px-2 py-1"
                    disabled={actionBusy || transferCandidates.length === 0}
                    value={transferTargetId}
                    onChange={(ev) => setTransferTargetId(ev.target.value)}
                    options={[
                      { value: '', label: '선택' },
                      ...transferCandidates.map((m) => ({
                        value: m.userId,
                        label: m.displayName || m.username,
                      })),
                    ]}
                  />
                </div>
                <FormButton
                  htmlType="button"
                  variant="primary"
                  disabled={actionBusy || !transferTargetId || transferCandidates.length === 0}
                  className="text-sm shrink-0"
                  onClick={() => void handleTransferLeader()}
                >
                  팀장 위임
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="action"
                  disabled={actionBusy}
                  className="text-sm shrink-0 text-[var(--text-secondary)]"
                  onClick={() => void handleLeave()}
                >
                  팀 탈퇴
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="action"
                  disabled={actionBusy || !canDisband}
                  title={
                    !canDisband && otherMemberCount > 0
                      ? '팀원이 없는 경우에만 팀 해체가 가능합니다'
                      : undefined
                  }
                  className="text-sm shrink-0 disabled:opacity-50"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => void handleDisband()}
                >
                  팀 해체
                </FormButton>
              </div>
            </div>
          ) : null}

          {!iAmOwner ? (
            <div className="flex justify-end mb-2 mt-2">
              <FormButton
                htmlType="button"
                variant="action"
                disabled={actionBusy || !teamActive}
                className="text-sm text-[var(--text-secondary)] hover:underline disabled:opacity-50"
                onClick={() => void handleLeave()}
              >
                팀 탈퇴
              </FormButton>
            </div>
          ) : null}

          <div className="border-t border-[var(--border-default)] mt-2">
            {members.map((m) => {
              const isRowOwner = Boolean(ownerId && m.userId === ownerId)
              const isMe = Boolean(user?.id && m.userId === user.id)
              return (
                <div
                  key={m.userId}
                  className="flex justify-between items-center py-2 border-b border-[var(--border-default)] gap-2"
                >
                  <div className="flex items-center gap-2 text-sm text-[var(--text-primary)] min-w-0">
                    <span className="truncate">{m.displayName || m.username}</span>
                    {isRowOwner ? (
                      <span className="text-amber-400 text-xs whitespace-nowrap shrink-0">★ 팀장</span>
                    ) : null}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {iAmOwner && teamActive && !isRowOwner ? (
                      <FormButton
                        htmlType="button"
                        variant="action"
                        disabled={actionBusy}
                        className="text-xs disabled:opacity-50"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => void handleKick(m.userId)}
                      >
                        강퇴
                      </FormButton>
                    ) : null}
                    {isMe && !isRowOwner && teamActive ? (
                      <FormButton
                        htmlType="button"
                        variant="action"
                        disabled={actionBusy}
                        className="text-xs text-[var(--text-secondary)] disabled:opacity-50"
                        onClick={() => void handleLeave()}
                      >
                        팀 탈퇴
                      </FormButton>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
      {confirmDialog}
    </div>
  )
}
