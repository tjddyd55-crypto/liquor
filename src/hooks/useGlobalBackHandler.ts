import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

import { useAuth } from '../features/auth/AuthProvider'
import useIsMobile from './useIsMobile'
import { resolveBackRoute } from '../navigation/backNavigationPolicy'

type GlobalBackMessage = { type?: string }

/**
 * 모바일 WebView 등에서 오는 “하드웨어 뒤로” 의도를 라우터로만 처리한다.
 *
 * - 고객 등록(?mode=create): 즉시 이동하지 않고 insurance-native-back과 동일 이벤트로 모달·blocker 흐름 유지
 * - 고객/상세/기능 페이지: `resolveBackRoute` 기준 상위 경로로 이동
 * - 그 외: `/customers`로 이동
 *
 * 주의: `popstate`는 React Router·useBlocker와 이중 처리되기 쉬워 등록하지 않는다.
 * 브라우저 뒤로는 Router가 담당하고, 네이티브·postMessage·커스텀 이벤트만 여기서 처리한다.
 */
export function useGlobalBackHandler(enabled: boolean) {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useIsMobile()
  const locationRef = useRef(location)

  useEffect(() => {
    locationRef.current = location
  }, [location])

  useEffect(() => {
    if (!enabled || !isMobile) {
      return
    }

    const nav = navigate

    const dispatchCustomerCreateBack = (): void => {
      try {
        window.dispatchEvent(
          new CustomEvent('insurance-native-back', { detail: { reason: 'customer-create-exit' } }),
        )
      } catch {
        /* ignore */
      }
    }

    const handleBridgeBack = (): void => {
      const loc = locationRef.current
      const path = loc.pathname
      const search = loc.search ?? ''
      const beforeBackEvent = new CustomEvent('insurance-before-global-back', {
        cancelable: true,
        detail: { pathname: path, search },
      })
      const shouldContinue = window.dispatchEvent(beforeBackEvent)
      if (!shouldContinue) {
        return
      }

      const resolved = resolveBackRoute(path, search)
      if (resolved == null) {
        if (window.history.length > 1) {
          nav(-1)
          return
        }
        nav('/customers')
        return
      }
      if (resolved.kind === 'customer-create-exit') {
        dispatchCustomerCreateBack()
        return
      }
      nav(resolved.path, resolved.replace ? { replace: true } : undefined)
    }

    const onMessage = (event: MessageEvent): void => {
      const data = event.data
      if (data === 'BACK') {
        handleBridgeBack()
        return
      }
      if (data && typeof data === 'object') {
        const t = (data as GlobalBackMessage).type
        if (t === 'INSURANCE_BACK' || t === 'insurance-back') {
          handleBridgeBack()
        }
      }
    }

    const onInsuranceGlobalBack = (): void => {
      handleBridgeBack()
    }

    window.addEventListener('message', onMessage)
    window.addEventListener('insurance-global-back', onInsuranceGlobalBack as EventListener)

    const w = window as unknown as { __insurance_dispatch_global_back?: () => void }
    w.__insurance_dispatch_global_back = handleBridgeBack

    return () => {
      window.removeEventListener('message', onMessage)
      window.removeEventListener('insurance-global-back', onInsuranceGlobalBack as EventListener)
      if (w.__insurance_dispatch_global_back === handleBridgeBack) {
        delete w.__insurance_dispatch_global_back
      }
    }
  }, [enabled, isMobile, navigate])
}

export function GlobalBackHandlerHost() {
  const { isAuthenticated } = useAuth()
  useGlobalBackHandler(isAuthenticated)
  return null
}
