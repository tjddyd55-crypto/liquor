/**
 * 고객앱이 설계사 웹(PC 브라우저)이 아니라 **네이티브 고객앱 WebView** 안에서
 * 실행 중인지 판별한다. 닫기 UX·안내 문구 분기에 사용한다.
 *
 * `ReactNativeWebView` 주입이 한 틱 늦는 환경을 위해 `apps/customer-mobile` 이
 * `injectedJavaScriptBeforeContentLoaded` 로 심는 플래그·localStorage 도 함께 본다.
 */

const WEBVIEW_LS_KEY = 'insurance.customer-app.webview'

export function isCustomerAppNativeWebView(): boolean {
  if (typeof window === 'undefined') {
    return false
  }
  const w = window as Window & {
    ReactNativeWebView?: { postMessage?: (msg: string) => void }
    __INSURANCE_CUSTOMER_APP_WEBVIEW__?: boolean
  }
  if (w.__INSURANCE_CUSTOMER_APP_WEBVIEW__ === true) {
    return true
  }
  try {
    if (window.localStorage?.getItem(WEBVIEW_LS_KEY) === '1') {
      return true
    }
  } catch {
    /* noop */
  }
  if (w.ReactNativeWebView && typeof w.ReactNativeWebView.postMessage === 'function') {
    return true
  }
  try {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('appWebView') === '1') {
      return true
    }
  } catch {
    /* noop */
  }
  return false
}
