import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useConfirmDialog } from '../../../components/dialog'
import { StatusMessage } from '../../../components/feedback'
import { FormButton, FormInput } from '../../../components/form'
import { getCustomerAppProfile, saveCustomerAppProfile } from '../api/customerAppApi'
import {
  clearCustomerAppSession,
  readCustomerAppProfile,
  writeCustomerAppProfile,
  writeCustomerAppSession,
} from '../session/customerAppSession'
import { useCustomerAppSession } from '../session/useCustomerAppSession'

export default function CustomerAppProfilePage() {
  const navigate = useNavigate()
  const { confirm, confirmDialog } = useConfirmDialog()
  const session = useCustomerAppSession()
  const profile = useMemo(() => readCustomerAppProfile(), [])
  const [name, setName] = useState(profile?.name ?? '')
  const [birthDate, setBirthDate] = useState(profile?.birthDate ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [error, setError] = useState('')
  const [result, setResult] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) {
      navigate('/customer-app', { replace: true })
    }
  }, [navigate, session])

  useEffect(() => {
    if (!session) {
      return
    }
    let mounted = true
    const run = async () => {
      try {
        const saved = await getCustomerAppProfile(session.appToken)
        if (!mounted || !saved) {
          return
        }
        setName(saved.name)
        setBirthDate(saved.birthDate)
        setPhone(saved.phone)
        writeCustomerAppProfile({
          name: saved.name,
          birthDate: saved.birthDate,
          phone: saved.phone,
        })
      } catch {
        // 서버 조회 실패 시 로컬 캐시를 그대로 사용한다.
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [session])

  if (!session) {
    return null
  }

  const handleSave = async () => {
    setError('')
    setResult('')
    const nextName = name.trim()
    const nextBirthDate = birthDate.trim()
    const nextPhone = phone.trim()
    if (!nextName || !nextBirthDate || !nextPhone) {
      setError('이름, 생년월일, 연락처를 모두 입력해 주세요.')
      return
    }
    setBusy(true)
    try {
      const saved = await saveCustomerAppProfile(session.appToken, {
        name: nextName,
        birthDate: nextBirthDate,
        phone: nextPhone,
      })
      writeCustomerAppProfile({
        name: saved.name,
        birthDate: saved.birthDate,
        phone: saved.phone,
      })
      writeCustomerAppSession({
        ...session,
        requesterName: saved.name,
        requesterBirthDate: saved.birthDate,
        requesterPhone: saved.phone,
      })
      setResult('내정보가 저장되었습니다.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '내정보 저장에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="customer-app-profile-page">
        <StatusMessage message={error} tone="error" />
        <StatusMessage message={result} tone="success" />
        <div className="customer-app-profile-page__inputs">
          <FormInput
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="이름"
          />
          <FormInput
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
            placeholder="생년월일 (예: 900101)"
          />
          <FormInput
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="연락처 (예: 010-1234-5678)"
          />
        </div>
        <FormButton htmlType="button" variant="primary" onClick={() => void handleSave()} loading={busy}>
          저장
        </FormButton>

        <p className="text-xs text-[var(--text-secondary)] leading-5 mt-4 mb-0 px-0">
          자주 이용하시면 브라우저에서 <strong className="text-[var(--text-main)] font-medium">홈 화면에 추가</strong>해 앱처럼 쓸 수 있습니다.
          Android: Chrome 메뉴(⋮) → 홈 화면에 추가 · iPhone: Safari 공유 → 홈 화면에 추가
        </p>

        <div className="customer-app-profile__danger">
          <FormButton
            htmlType="button"
            variant="danger"
            className="button button--danger customer-app-profile__logout"
            onClick={async () => {
              const ok = await confirm({
                title: '연결 해제',
                message: '연결을 해제하시겠어요? 다시 이용하려면 설계사가 보낸 연결 링크로 다시 연결해 주세요.',
                tone: 'danger',
              })
              if (!ok) {
                return
              }
              clearCustomerAppSession()
              navigate('/customer-app', { replace: true })
            }}
          >
            연결 해제
          </FormButton>
          <p className="customer-app-profile__danger-help">
            다른 기기에서 이용하거나 링크로 다시 연결하려면 연결 해제를 눌러 주세요.
          </p>
        </div>
      </div>
      {confirmDialog}
    </>
  )
}
