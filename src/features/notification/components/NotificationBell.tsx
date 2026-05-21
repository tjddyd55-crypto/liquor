import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { FormButton } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import { fetchUnreadCount } from '../api/notificationApi'
import { NOTIFICATION_REFRESH_EVENT } from '../notificationRefreshDispatch'
import { NotificationList } from './NotificationList'

export type NotificationBellVariant = 'inline' | 'workspaceHeader'

type Props = {
  variant?: NotificationBellVariant
  /** workspaceHeader: header 아래에 패널을 고정할 때 기준 요소로 사용한다. */
  boundaryRef?: RefObject<HTMLElement | null>
}

export function NotificationBell({ variant = 'inline', boundaryRef }: Props) {
  const { token, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const isNewsManager = user?.role === 'INSURER_MANAGER' || user?.role === 'LOSS_ADJUSTER'

  const refreshUnread = useCallback(async () => {
    if (!token?.trim() || isNewsManager) {
      setUnreadCount(0)
      return
    }
    try {
      const { count } = await fetchUnreadCount(token)
      setUnreadCount(Number.isFinite(count) && count > 0 ? count : 0)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUnreadCount(0)
        return
      }
      setUnreadCount(0)
    }
  }, [isNewsManager, token])

  useEffect(() => {
    queueMicrotask(() => {
      void refreshUnread()
    })
  }, [refreshUnread])

  useEffect(() => {
    function onFocus() {
      queueMicrotask(() => {
        void refreshUnread()
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refreshUnread])

  useEffect(() => {
    function onRefreshSignal() {
      queueMicrotask(() => {
        void refreshUnread()
      })
    }
    window.addEventListener(NOTIFICATION_REFRESH_EVENT, onRefreshSignal)
    return () => window.removeEventListener(NOTIFICATION_REFRESH_EVENT, onRefreshSignal)
  }, [refreshUnread])

  useEffect(() => {
    if (!open) {
      return
    }
    function onDocMouseDown(ev: MouseEvent) {
      const root = boundaryRef?.current ?? wrapRef.current
      if (root && ev.target instanceof Node && !root.contains(ev.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open, boundaryRef])

  if (!token?.trim() || isNewsManager) {
    return null
  }

  const trigger = (
    <FormButton
      htmlType="button"
      variant="action"
      className="app-tenant-ga-bar__notification-trigger notification-icon"
      aria-expanded={open}
      aria-haspopup="true"
      aria-label={'\uC54C\uB9BC'}
      onClick={() => {
        setOpen((v) => !v)
        void refreshUnread()
      }}
    >
      <span className="relative inline-block text-lg leading-none" aria-hidden>
        {'\uD83D\uDD14'}
      </span>
      {unreadCount > 0 ? (
        <span
          className="absolute -top-0.5 -right-1 min-w-[1rem] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-semibold leading-none"
          aria-hidden
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : null}
    </FormButton>
  )

  const panel = open ? (
    <div
      className={
        variant === 'workspaceHeader'
          ? 'notification-panel notification-panel--workspace-header notification-dropdown'
          : 'notification-panel'
      }
      role="dialog"
      aria-label={'\uC54C\uB9BC \uBAA9\uB85D'}
    >
      <div className="notification-panel__header">{'\uC54C\uB9BC'}</div>
      <div className="notification-panel__body">
        <NotificationList token={token} onUnreadChanged={() => void refreshUnread()} />
      </div>
    </div>
  ) : null

  if (variant === 'workspaceHeader') {
    return (
      <div className="app-workspace-chrome-header__notification-root">
        <div className="header-right app-workspace-chrome-header__header-right">{trigger}</div>
        {panel}
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      {trigger}
      {panel}
    </div>
  )
}
