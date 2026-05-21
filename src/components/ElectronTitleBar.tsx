/** Frameless Electron title bar: back, drag region, window controls. */
import { FormButton } from './form'
import { useLayoutEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../features/auth/AuthProvider'
import { formatGaBannerLabel, shouldShowGaTenantChrome } from '../navigation/gaTenantBarShared'

/**
 * 로그인 전(HIDE_GA_BAR_PATHS 포함) 또는 테넌트 컨텍스트가 없을 때 타이틀바 중앙에
 * 표시되는 기본 브랜드 문구. 로그인 후에는 `formatGaBannerLabel` 로 사용자 소속
 * GA 이름이 표시된다(하드코딩 없음).
 */
const APP_TITLE = 'FC-OA'
const BACK_LABEL = '\uB4A4\uB85C\uAC00\uAE30'

export function ElectronTitleBar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, isAuthenticated } = useAuth()
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const active = Boolean(api?.minimize && api?.maximize && api?.close)

  const tenantChrome = shouldShowGaTenantChrome(isAuthenticated, user?.gaId, location.pathname)
  const hideBackForInviteRegister = location.pathname.startsWith('/customer/register')

  useLayoutEffect(() => {
    const el = document.documentElement
    const body = document.body
    el.classList.add('electron-app')
    body.classList.add('electron-only')
    return () => {
      el.classList.remove('electron-app')
      body.classList.remove('electron-only')
    }
  }, [])

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back()
      return
    }
    if (location.pathname.startsWith('/team')) {
      navigate('/team')
      return
    }
    if (location.pathname.startsWith('/customers')) {
      navigate('/customers')
      return
    }
    navigate('/')
  }

  return (
    <header className="top-title-bar electron-title-bar title-bar" role="banner">
      <div className="title-left no-drag">
        {hideBackForInviteRegister ? null : (
          <FormButton
            htmlType="button"
            className="back-btn no-drag"
            aria-label={BACK_LABEL}
            onClick={handleBack}
          >
            ←
          </FormButton>
        )}
      </div>

      <div className="title-center">
        <div className="drag-area">
          <span className="electron-title-bar__app-name">
            {tenantChrome ? (
              <span className="electron-title-bar__ga-name">
                {formatGaBannerLabel(user?.gaName ?? '', user?.gaCode ?? '')}
              </span>
            ) : (
              APP_TITLE
            )}
          </span>
        </div>
      </div>

      <div className="title-right no-drag">
        <div className="window-controls">
          <FormButton
            htmlType="button"
            className="electron-title-bar__control electron-title-bar__control--win"
            aria-label="Minimize"
            onClick={() => api?.minimize?.()}
            disabled={!active}
          >
            —
          </FormButton>
          <FormButton
            htmlType="button"
            className="electron-title-bar__control electron-title-bar__control--win"
            aria-label="Maximize or restore"
            onClick={() => api?.maximize?.()}
            disabled={!active}
          >
            {'\u25A1'}
          </FormButton>
          <FormButton
            htmlType="button"
            className="electron-title-bar__control electron-title-bar__control--win electron-title-bar__control--close"
            aria-label="Close"
            onClick={() => api?.close?.()}
            disabled={!active}
          >
            {'\u2715'}
          </FormButton>
        </div>
      </div>
    </header>
  )
}
