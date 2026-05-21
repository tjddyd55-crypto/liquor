import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { login as loginApi } from '../../auth/authApi'
import { useGovernmentAccess } from './useGovernmentAccess'
import { resolveGovernmentHomePath } from '../lib/governmentHome'

type LoginFlash = {
  passwordReset?: boolean
  accountReset?: boolean
}

export type UseGovernmentLoginControllerResult = {
  username: string
  password: string
  errorMessage: string
  isSubmitting: boolean
  version: string
  flash: LoginFlash
  setUsername: (value: string) => void
  setPassword: (value: string) => void
  handleSubmit: (event: FormEvent) => void
}

export function useGovernmentLoginController(): UseGovernmentLoginControllerResult {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, login, token } = useAuth()
  const { summary, loading: accessLoading } = useGovernmentAccess(token)
  const flash = (location.state ?? {}) as LoginFlash

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (isAuthenticated && token && !accessLoading && summary) {
      navigate(resolveGovernmentHomePath(summary), { replace: true })
    }
  }, [isAuthenticated, token, accessLoading, summary, navigate])

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
