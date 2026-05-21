import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthProvider'
import { login as loginApi } from '../authApi'
import { resolveAuthLandingPath } from '../landing'
import useIsMobile from '../../../hooks/useIsMobile'
import { isGovernmentGaSession } from '../../government-support/lib/isGovernmentGaSession'
import { resolveGovernmentSessionHomePath } from '../../government-support/lib/resolveGovernmentSessionHomePath'

/**
 * 로그인 페이지가 소비하는 "일시적 플래시 메시지".
 * 비밀번호 재설정·계정 초기화 후 리다이렉트 되어 오는 사용자에게 1회성으로만 노출된다.
 * (라우팅 state 로만 전달되므로 새로고침 시 사라지는 것이 정책)
 */
type LoginFlash = {
  passwordReset?: boolean
  accountReset?: boolean
}

export type UseLoginControllerResult = {
  username: string
  password: string
  errorMessage: string
  isSubmitting: boolean
  /** Electron 네이티브 버전 (있으면) 또는 웹 번들 버전 */
  version: string
  flash: LoginFlash
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  /** form `onSubmit` 에 바로 연결 가능하도록 void 반환으로 래핑한 submit 핸들러 */
  handleSubmit: (event: FormEvent) => void
}

/**
 * [Hook] 로그인 페이지 컨트롤러.
 *
 * 책임:
 *  - 폼 상태(username / password / errorMessage / isSubmitting) 관리
 *  - 로그인 API 호출 + 성공 시 기본 랜딩 경로로 리다이렉트
 *  - 이미 인증된 세션은 기본 랜딩 경로로 즉시 리다이렉트
 *  - Electron 네이티브 / 웹 번들 버전 조회 (footer 표시용)
 *
 * 기본 랜딩 경로는 역할·디바이스에 따라 다르다 (→ `resolveAuthLandingPath`).
 * 정책 변경은 `../landing.ts` 한 곳에서만 수행한다.
 *
 * 책임이 아닌 것:
 *  - UI 마크업: `../pages/Login/*View.tsx`
 *  - PC/Mobile 분기: container(`../pages/LoginPage.tsx`) + `ResponsiveLayout`
 *
 * 동일 훅을 PCView/MobileView 에서 각각 호출해도,
 * `ResponsiveLayout` 이 둘 중 하나만 렌더하므로 중복 실행이 발생하지 않는다.
 * (※ `useGaCustomerExcelData` 와 동일한 패턴)
 */
export function useLoginController(): UseLoginControllerResult {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, user, token } = useAuth()
  const isMobile = useIsMobile()
  const flash = (location.state ?? {}) as LoginFlash

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return
    }
    if (isGovernmentGaSession(user)) {
      return
    }
    navigate(resolveAuthLandingPath(isMobile, user?.role), { replace: true })
  }, [isAuthenticated, isMobile, navigate, user])

  useEffect(() => {
    if (!isAuthenticated || !user || !token?.trim() || !isGovernmentGaSession(user)) {
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const path = await resolveGovernmentSessionHomePath({ token, user }, isMobile)
        if (!cancelled) {
          navigate(path, { replace: true })
        }
      } catch {
        if (!cancelled) {
          navigate('/government/login', { replace: true })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, isMobile, navigate, token, user])

  useEffect(() => {
    let cancelled = false
    const webVersion =
      typeof __INSURANCE_WEB_APP_VERSION__ === 'string' ? __INSURANCE_WEB_APP_VERSION__ : ''

    void (async () => {
      if (typeof window !== 'undefined' && window.electronAPI?.getVersion) {
        try {
          const v = await window.electronAPI.getVersion()
          if (!cancelled) {
            setVersion(v)
          }
          return
        } catch {
          /* Electron 버전 조회 실패 시 웹 번들 버전으로 폴백 */
        }
      }
      if (!cancelled) {
        setVersion(webVersion)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      const session = await loginApi(username, password)
      login(session)
      if (isGovernmentGaSession(session.user)) {
        const path = await resolveGovernmentSessionHomePath(session, isMobile)
        navigate(path, { replace: true })
        return
      }
      navigate(resolveAuthLandingPath(isMobile, session.user.role), { replace: true })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '로그인에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    username,
    password,
    errorMessage,
    isSubmitting,
    version,
    flash,
    setUsername,
    setPassword,
    handleSubmit: (event: FormEvent) => {
      void submit(event)
    },
  }
}
