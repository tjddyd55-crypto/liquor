/**
 * 고객앱 [닫기]: 네이티브 WebView 브릿지 → Android 브릿지 → 카카오톡 인앱 스킴 → window.close 계열.
 * Expo 고객앱은 `CUSTOMER_APP_CLOSE` 메시지로 네이티브에서 처리한다( App.tsx onMessage ).
 * - Android: `BackHandler.exitApp()` 으로 앱 종료
 * - iOS 등: WebView 뒤로가기 가능 시 `goBack()`, 아니면 `/customer-app` 홈으로 이동
 *
 * WebView 로 판별되면 브라우저 안내용 `window.close` 폴백 전에 postMessage(또는 홈 이동)만 수행한다.
 */

import { isCustomerAppNativeWebView } from './customerAppEnvironment'

type AndroidBridge = {
  closeApp?: () => void
  closeWindow?: () => void
}

type WebKitHandlers = Record<string, { postMessage?: (message: unknown) => void } | undefined>

export function closeCustomerApp(): void {
  const w = window as Window & {
    Android?: AndroidBridge
    ReactNativeWebView?: { postMessage: (message: string) => void }
  }

  if (typeof w.Android?.closeApp === 'function') {
    w.Android.closeApp()
    return
  }
  if (typeof w.Android?.closeWindow === 'function') {
    w.Android.closeWindow()
    return
  }

  if (isCustomerAppNativeWebView()) {
    if (typeof w.ReactNativeWebView?.postMessage === 'function') {
      try {
        w.ReactNativeWebView.postMessage(JSON.stringify({ type: 'CUSTOMER_APP_CLOSE' }))
        return
      } catch {
        /* postMessage 실패 시에만 같은 오리진 홈으로 */
      }
    }
    try {
      window.location.assign(`${window.location.origin}/customer-app/home`)
    } catch {
      try {
        window.location.href = '/customer-app/home'
      } catch {
        /* noop */
      }
    }
    return
  }

  try {
    const raw = window.webkit?.messageHandlers as WebKitHandlers | undefined
    const closeAppHandler = raw?.closeApp
    if (closeAppHandler && typeof closeAppHandler.postMessage === 'function') {
      closeAppHandler.postMessage({})
      return
    }
    const closeWindowHandler = raw?.closeWindow
    if (closeWindowHandler && typeof closeWindowHandler.postMessage === 'function') {
      closeWindowHandler.postMessage({})
      return
    }
  } catch {
    // fall through
  }

  const ua = navigator.userAgent.toLowerCase()
  const isKakao = ua.includes('kakaotalk')
  const isIOS = /iphone|ipad|ipod/.test(ua)
  const isAndroid = ua.includes('android')

  if (isKakao) {
    if (isIOS) {
      window.location.href = 'kakaoweb://closeBrowser'
      return
    }
    if (isAndroid) {
      window.location.href = 'kakaotalk://inappbrowser/close'
      return
    }
    window.location.href = 'kakaotalk://inappbrowser/close'
    return
  }

  try {
    window.close()
  } catch {
    /* noop */
  }

  try {
    window.open('', '_self')
    window.close()
  } catch {
    /* noop */
  }
}
