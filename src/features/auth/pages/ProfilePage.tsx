import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ApiError } from '../../../lib/apiClient'
import { normalizeKrMobile, validateKrMobileDigits } from '../../../lib/phoneNormalize'
import { FormButton, FormInput } from '../../../components/form'
import { Button, Modal } from '../../../components/ui'
import {
  fetchMe,
  patchMe,
  sendPhoneChangeCode,
  verifyPhoneChangeCode,
  type MeResponse,
} from '../authApi'
import { useAuth } from '../AuthProvider'
import { createTeam, fetchTeamMembers, joinTeam } from '../../team/api/teamApi'
import { DesktopUpdateSection } from '../../../components/DesktopUpdateSection'
import { UserGaExcelManagePanel } from '../../profile/components/UserGaExcelManagePanel'
import { CustomerExcelImportPanel } from '../../customers/components/CustomerExcelImportPanel'
import PCOnlySection from '../../../components/PCOnlySection'
import { SubscriptionStatusCard } from '../../subscription/components/SubscriptionStatusCard'

const CODE_TTL_SEC = 180
const RESEND_COOLDOWN_SEC = 60

function canAccessMyInfoPage(role: string | undefined): boolean {
  return role === 'USER' || role === 'GA_ADMIN'
}

export function ProfilePage() {
  const { token, user, login, isAuthenticated } = useAuth()
  const pageTitle = '내 정보 관리'
  const [me, setMe] = useState<MeResponse | null>(null)
  const [loadError, setLoadError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneEditDigits, setPhoneEditDigits] = useState('')
  const [code, setCode] = useState('')
  const [phoneChangeProof, setPhoneChangeProof] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [infoMessage, setInfoMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [resendLeft, setResendLeft] = useState(0)
  const [debugCodeHint, setDebugCodeHint] = useState('')

  const [myTeamId, setMyTeamId] = useState<string | null>(null)
  const [createTeamOpen, setCreateTeamOpen] = useState(false)
  const [connectTeamOpen, setConnectTeamOpen] = useState(false)
  const [teamNameInput, setTeamNameInput] = useState('')
  const [joinTeamCodeInput, setJoinTeamCodeInput] = useState('')
  const [teamBusy, setTeamBusy] = useState(false)
  const [teamActionError, setTeamActionError] = useState('')
  const [teamActionInfo, setTeamActionInfo] = useState('')
  const [teamCodeCopied, setTeamCodeCopied] = useState(false)
  const [teamCopyNotice, setTeamCopyNotice] = useState('')
  const teamCopyFeedbackTimerRef = useRef<number | null>(null)

  const clearTeamCopyFeedbackTimer = () => {
    if (teamCopyFeedbackTimerRef.current != null) {
      window.clearTimeout(teamCopyFeedbackTimerRef.current)
      teamCopyFeedbackTimerRef.current = null
    }
  }

  const loadMyTeamId = useCallback(async () => {
    if (!token?.trim() || !user?.teamId?.trim()) {
      setMyTeamId(null)
      return
    }
    try {
      const data = await fetchTeamMembers(token)
      setMyTeamId(data.teamId)
    } catch {
      setMyTeamId(null)
    }
  }, [token, user?.teamId])

  useEffect(() => {
    void loadMyTeamId()
  }, [loadMyTeamId])

  useEffect(() => {
    return () => {
      if (teamCopyFeedbackTimerRef.current != null) {
        window.clearTimeout(teamCopyFeedbackTimerRef.current)
      }
    }
  }, [])

  const scheduleTeamCopyNotice = (message: string, ms: number) => {
    clearTeamCopyFeedbackTimer()
    setTeamCopyNotice(message)
    teamCopyFeedbackTimerRef.current = window.setTimeout(() => {
      setTeamCopyNotice('')
      teamCopyFeedbackTimerRef.current = null
    }, ms)
  }

  const copyTeamCode = async () => {
    clearTeamCopyFeedbackTimer()
    setTeamCopyNotice('')
    if (!myTeamId?.trim()) {
      scheduleTeamCopyNotice('팀이 없습니다', 2000)
      return
    }
    try {
      await navigator.clipboard.writeText(myTeamId)
      setTeamCodeCopied(true)
      teamCopyFeedbackTimerRef.current = window.setTimeout(() => {
        setTeamCodeCopied(false)
        teamCopyFeedbackTimerRef.current = null
      }, 1500)
    } catch {
      scheduleTeamCopyNotice('복사에 실패했습니다.', 2000)
    }
  }

  const onCreateTeamSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim() || !user) {
      return
    }
    if (user.teamId?.trim()) {
      setTeamActionError('이미 팀에 소속되어 있습니다')
      return
    }
    setTeamBusy(true)
    setTeamActionError('')
    setTeamActionInfo('')
    try {
      const created = await createTeam(token, teamNameInput.trim() || undefined)
      setMyTeamId(created.teamId)
      login({ token, user: { ...user, teamId: created.teamId } })
      setTeamActionError('')
      setTeamNameInput('')
      setCreateTeamOpen(false)
      setTeamActionInfo('팀이 생성되었습니다.')
      await loadMyTeamId()
      void load()
    } catch (err) {
      setTeamActionError(err instanceof Error ? err.message : '팀 만들기에 실패했습니다.')
    } finally {
      setTeamBusy(false)
    }
  }

  const onJoinTeamSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim() || !user) {
      return
    }
    if (user.teamId?.trim()) {
      setTeamActionError('이미 팀에 소속되어 있습니다')
      return
    }
    setTeamBusy(true)
    setTeamActionError('')
    setTeamActionInfo('')
    try {
      const joined = await joinTeam(token, joinTeamCodeInput.trim())
      setMyTeamId(joined.teamId)
      login({ token, user: { ...user, teamId: joined.teamId } })
      setTeamActionError('')
      setJoinTeamCodeInput('')
      setConnectTeamOpen(false)
      setTeamActionInfo('팀에 참여했습니다.')
      await loadMyTeamId()
      void load()
    } catch (err) {
      setTeamActionError(err instanceof Error ? err.message : '팀 참여에 실패했습니다.')
    } finally {
      setTeamBusy(false)
    }
  }

  useEffect(() => {
    if (secondsLeft <= 0) {
      return
    }
    const t = window.setInterval(() => {
      setSecondsLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [secondsLeft])

  useEffect(() => {
    if (resendLeft <= 0) {
      return
    }
    const t = window.setInterval(() => {
      setResendLeft((s) => (s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(t)
  }, [resendLeft])

  const load = useCallback(async () => {
    if (!token) {
      return
    }
    setLoadError('')
    try {
      const row = await fetchMe(token)
      setMe(row)
      setDisplayName(row.display_name)
      setPhoneInput(row.phone_number)
      setPhoneEditDigits(row.phone_number)
      setPhoneChangeProof(null)
      setCode('')
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '프로필을 불러오지 못했습니다.')
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!token || !user || !me) {
      return
    }
    const nextTid = me.team_id?.trim() ? me.team_id.trim() : null
    const prevTid = user.teamId?.trim() ?? null
    // me가 아직 팀 반영 전일 수 있어, null로 세션을 내리지 않음. 소속이 확인될 때만 동기화.
    if (nextTid != null && prevTid !== nextTid) {
      login({ token, user: { ...user, teamId: nextTid } })
    }
  }, [me, token, user, login])

  if (!isAuthenticated || !token || !user) {
    return <Navigate to="/login" replace />
  }

  if (!canAccessMyInfoPage(user.role)) {
    return <Navigate to="/dashboard" replace />
  }

  const normalizedEditPhone = normalizeKrMobile(phoneEditDigits)
  const phoneChangedPending =
    normalizedEditPhone !== '' && normalizedEditPhone !== normalizeKrMobile(me?.phone_number ?? '')

  const sendCode = async () => {
    if (!token) {
      return
    }
    setErrorMessage('')
    setInfoMessage('')
    const pErr = validateKrMobileDigits(normalizedEditPhone)
    if (pErr) {
      setErrorMessage(pErr)
      return
    }
    if (!phoneChangedPending) {
      setErrorMessage('변경할 휴대폰 번호를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const r = await sendPhoneChangeCode(token, normalizedEditPhone)
      setInfoMessage(r.message ?? '인증번호를 발급했습니다.')
      if (r.debugCode) {
        setDebugCodeHint(`(개발용) 인증번호: ${r.debugCode}`)
      } else {
        setDebugCodeHint('')
      }
      setSecondsLeft(CODE_TTL_SEC)
      setResendLeft(RESEND_COOLDOWN_SEC)
      setCode('')
      setPhoneChangeProof(null)
    } catch (e) {
      if (e instanceof ApiError) {
        setErrorMessage(e.message)
        if (e.retryAfterSec != null) {
          setResendLeft(e.retryAfterSec)
        }
      } else {
        setErrorMessage(e instanceof Error ? e.message : '요청에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const verifyCode = async () => {
    if (!token) {
      return
    }
    setErrorMessage('')
    setInfoMessage('')
    if (!/^\d{6}$/.test(code.trim())) {
      setErrorMessage('인증번호 6자리를 입력해 주세요.')
      return
    }
    setSubmitting(true)
    try {
      const r = await verifyPhoneChangeCode(token, normalizedEditPhone, code.trim())
      setPhoneChangeProof(r.phone_change_proof)
      setInfoMessage(r.message ?? '인증이 완료되었습니다. 저장을 눌러 반영합니다.')
    } catch (e) {
      if (e instanceof ApiError) {
        setErrorMessage(e.message)
      } else {
        setErrorMessage(e instanceof Error ? e.message : '인증에 실패했습니다.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!token) {
      return
    }
    setErrorMessage('')
    setInfoMessage('')
    const nameTrim = displayName.trim()
    if (!nameTrim) {
      setErrorMessage('이름을 입력해 주세요.')
      return
    }

    const payload: {
      display_name: string
      phone_number?: string
      phone_change_proof?: string
    } = { display_name: nameTrim }

    if (phoneChangedPending) {
      if (!phoneChangeProof) {
        setErrorMessage('휴대폰 번호 변경을 위해 인증을 완료해 주세요.')
        return
      }
      payload.phone_number = normalizedEditPhone
      payload.phone_change_proof = phoneChangeProof
    }

    setSavingProfile(true)
    try {
      const updated = await patchMe(token, payload)
      setMe(updated)
      setPhoneInput(updated.phone_number)
      setPhoneEditDigits(updated.phone_number)
      setPhoneChangeProof(null)
      setCode('')
      login({
        token,
        user: {
          ...user,
          displayName: updated.display_name,
          teamId: updated.team_id?.trim() ? updated.team_id.trim() : null,
        },
      })
      setInfoMessage('저장했습니다.')
    } catch (e) {
      if (e instanceof ApiError) {
        setErrorMessage(e.message)
      } else {
        setErrorMessage(e instanceof Error ? e.message : '저장에 실패했습니다.')
      }
    } finally {
      setSavingProfile(false)
    }
  }

  if (loadError) {
    return (
      <main className="page page--with-back profile-page">
        <h1>{pageTitle}</h1>
        <p className="status status--error">{loadError}</p>
        <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void load()}>
          다시 시도
        </FormButton>
      </main>
    )
  }

  if (!me) {
    return (
      <main className="page page--with-back profile-page">
        <h1>{pageTitle}</h1>
        <p className="status">불러오는 중…</p>
      </main>
    )
  }

  const hasTeam = Boolean(user.teamId?.trim())

  return (
    <main className="page page--with-back profile-page">
      <h1>{pageTitle}</h1>
      <SubscriptionStatusCard subscription={user?.subscription ?? null} />
      <DesktopUpdateSection />

      <section>
        <h2 className="profile-page__section-title">내 정보</h2>
        <form className="auth-form" onSubmit={(e) => void onSubmit(e)}>
              <label className="field">
                <span className="field__label">이름</span>
                <FormInput
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </label>

              <label className="field">
                <span className="field__label">아이디</span>
                <FormInput value={me.username} readOnly />
              </label>

              <label className="field">
                <span className="field__label">휴대폰번호</span>
                <FormInput
                  value={phoneEditDigits}
                  onChange={(e) => {
                    setPhoneEditDigits(e.target.value)
                    setPhoneChangeProof(null)
                  }}
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder={phoneInput}
                  required
                />
              </label>

              {phoneChangedPending ? (
                <div className="field">
                  <span className="field__label">휴대폰 변경 인증</span>
                  <div className="profile-page__phone-verify-row">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      className="button button--secondary"
                      onClick={() => void sendCode()}
                      disabled={submitting || resendLeft > 0}
                    >
                      {resendLeft > 0 ? `재요청 (${resendLeft}s)` : '인증번호 요청'}
                    </FormButton>
                    {secondsLeft > 0 ? (
                      <span className="status" style={{ fontSize: '0.9rem' }}>
                        유효 시간 {secondsLeft}s
                      </span>
                    ) : null}
                  </div>
                  <FormInput
                    style={{ marginTop: 8 }}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputMode="numeric"
                    placeholder="인증번호 6자리"
                    maxLength={6}
                  />
                  <FormButton
                    htmlType="button"
                    variant="secondary"
                    className="button button--secondary"
                    style={{ marginTop: 8 }}
                    onClick={() => void verifyCode()}
                    disabled={submitting || code.trim().length !== 6}
                  >
                    인증 확인
                  </FormButton>
                  {phoneChangeProof ? (
                    <p className="status" style={{ color: 'var(--success)' }}>
                      인증 완료 — 저장 시 새 번호가 반영됩니다.
                    </p>
                  ) : null}
                  {debugCodeHint ? <p className="status">{debugCodeHint}</p> : null}
                </div>
              ) : null}

              <div className="field">
                <Link to="/password-reset" className="button button--secondary button--full">
                  비밀번호 재설정
                </Link>
              </div>

              {errorMessage ? <p className="status status--error">{errorMessage}</p> : null}
              {infoMessage ? <p className="status">{infoMessage}</p> : null}

              <FormButton
                className="button button--primary button--full profile-page__submit"
                htmlType="submit"
                variant="primary"
                disabled={savingProfile || (phoneChangedPending && !phoneChangeProof)}
              >
                {savingProfile ? '저장 중…' : '저장'}
              </FormButton>
        </form>
      </section>

      <section>
        <h2 className="profile-page__section-title">팀 관리</h2>
        <div className="profile-page__team-row">
              <FormButton
                htmlType="button"
                variant="action"
                className={`cta-button profile-page__team-btn${hasTeam ? ' opacity-50 cursor-not-allowed' : ''}`}
                aria-disabled={hasTeam}
                onClick={() => {
                  if (hasTeam) {
                    setTeamActionError('이미 팀에 소속되어 있습니다')
                    return
                  }
                  setTeamActionError('')
                  setTeamActionInfo('')
                  setCreateTeamOpen(true)
                }}
              >
                팀 생성
              </FormButton>
              <FormButton htmlType="button" variant="action" className="cta-button profile-page__team-btn" onClick={() => void copyTeamCode()}>
                {teamCodeCopied ? '복사됨 ✓' : '팀 코드 복사'}
              </FormButton>
              <FormButton
                htmlType="button"
                variant="action"
                className={`cta-button profile-page__team-btn${hasTeam ? ' opacity-50 cursor-not-allowed' : ''}`}
                aria-disabled={hasTeam}
                onClick={() => {
                  if (hasTeam) {
                    setTeamActionError('이미 팀에 소속되어 있습니다')
                    return
                  }
                  setTeamActionError('')
                  setTeamActionInfo('')
                  setConnectTeamOpen(true)
                }}
              >
                팀 연결
              </FormButton>
        </div>
        {teamCopyNotice ? (
          <p className="status text-sm" role="status" style={{ marginTop: 8 }}>
            {teamCopyNotice}
          </p>
        ) : null}
        {teamActionError ? (
          <p className="status status--error text-sm" role="alert" style={{ marginTop: 8 }}>
            {teamActionError}
          </p>
        ) : null}
        {teamActionInfo ? (
          <p className="status text-sm" role="status" style={{ marginTop: 8 }}>
            {teamActionInfo}
          </p>
        ) : null}
      </section>

      <div className="section-divider" />

      <section>
        <h2 className="profile-page__section-title">고객 데이터 업로드</h2>
        <PCOnlySection>
          <div className="profile-page__excel-toolbar">
            <CustomerExcelImportPanel
              token={token}
              onUploadsFinished={async () => {
                setInfoMessage('고객 데이터 업로드가 완료되었습니다.')
              }}
            />
          </div>
          <p className="status text-sm" style={{ marginTop: 8 }}>
            샘플 다운로드 후 양식에 맞게 작성한 파일을 업로드해 주세요.
          </p>
        </PCOnlySection>
      </section>

      <div className="section-divider" />

      <section>
        <h2 className="profile-page__section-title">GA 데이터 업로드</h2>
        <PCOnlySection>
          <div className="profile-page__excel-toolbar">
            <UserGaExcelManagePanel token={token} />
          </div>
          <p className="status text-sm" style={{ marginTop: 8 }}>
            회사 DB 파일 업로드/조회는{' '}
            <Link to="/storage" className="switch-text__action">
              내 저장공간
            </Link>
            에서 진행합니다.
          </p>
        </PCOnlySection>
      </section>

      <Link
        to="/account/reset"
        className="button button--secondary button--full profile-page__account-reset"
      >
        계정 초기화
      </Link>

      <div className="switch-text">
        <Link to="/dashboard" className="switch-text__action">
          대시보드로
        </Link>
      </div>

      <Modal
        open={createTeamOpen}
        onClose={() => {
          setTeamActionError('')
          setCreateTeamOpen(false)
        }}
        ariaLabel="팀 생성"
      >
        <div className="text-lg font-semibold mb-3 text-[var(--text-primary)]">팀 생성</div>
        <form onSubmit={(ev) => void onCreateTeamSubmit(ev)}>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            팀 이름 (선택)
            <FormInput
              className="mt-1 w-full box-border border border-[var(--border-default)] rounded-md p-2 text-sm bg-[var(--bg-soft)] text-[var(--text-primary)]"
              value={teamNameInput}
              onChange={(ev) => setTeamNameInput(ev.target.value)}
              maxLength={120}
              placeholder="예: 강남1팀"
              autoComplete="off"
            />
          </label>
          {teamActionError ? (
            <p className="text-[var(--danger)] text-sm mb-2" role="alert">
              {teamActionError}
            </p>
          ) : null}
          <div className="flex gap-2 flex-wrap mt-2">
            <Button type="submit" disabled={teamBusy}>
              {teamBusy ? '처리 중…' : '생성'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={teamBusy}
              onClick={() => setCreateTeamOpen(false)}
            >
              취소
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={connectTeamOpen}
        onClose={() => {
          setTeamActionError('')
          setConnectTeamOpen(false)
        }}
        ariaLabel="팀 연결"
      >
        <div className="text-lg font-semibold mb-3 text-[var(--text-primary)]">팀 연결</div>
        <form onSubmit={(ev) => void onJoinTeamSubmit(ev)}>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">
            팀 코드
            <FormInput
              className="mt-1 w-full box-border border border-[var(--border-default)] rounded-md p-2 text-sm bg-[var(--bg-soft)] text-[var(--text-primary)]"
              value={joinTeamCodeInput}
              onChange={(ev) => setJoinTeamCodeInput(ev.target.value)}
              placeholder="팀 코드 입력"
              autoComplete="off"
            />
          </label>
          {teamActionError ? (
            <p className="text-[var(--danger)] text-sm mb-2" role="alert">
              {teamActionError}
            </p>
          ) : null}
          <div className="flex gap-2 flex-wrap mt-2">
            <Button type="submit" disabled={teamBusy || !joinTeamCodeInput.trim()}>
              {teamBusy ? '처리 중…' : '연결'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={teamBusy}
              onClick={() => setConnectTeamOpen(false)}
            >
              취소
            </Button>
          </div>
        </form>
      </Modal>
    </main>
  )
}
