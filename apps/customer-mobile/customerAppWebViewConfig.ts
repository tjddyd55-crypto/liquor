/**
 * 고객 네이티브 앱 WebView 진입 URL.
 * - 기본값은 AGENTS.md 운영 호스트 + SPA 경로 `/customer-app` 과 일치한다.
 * - EAS 빌드에서 `EXPO_PUBLIC_CUSTOMER_APP_URL` 로 덮어쓸 수 있다(번들에 인라인됨).
 * - OTA(EAS Update)는 JS만 갱신하므로, 이 상수 변경이 예전 네이티브 바이너리에 없으면
 *   **새 APK/AAB 빌드**가 필요하다.
 */

export const DEFAULT_CUSTOMER_APP_WEB_URL =
  'https://insurance-production-7bd8.up.railway.app/customer-app'

function normalizePathname(pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/'
  return p === '/' ? '/customer-app' : p
}

/**
 * @returns WebView `source.uri` 에 쓸 절대 URL(https). 잘못된 env 는 기본값으로 폴백.
 */
export function resolveCustomerAppWebViewUrl(): string {
  const raw = String(
    typeof process !== 'undefined' ? process.env.EXPO_PUBLIC_CUSTOMER_APP_URL ?? '' : '',
  ).trim()

  const candidate = raw || DEFAULT_CUSTOMER_APP_WEB_URL

  try {
    const u = new URL(candidate)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') {
      console.warn('[InsuranceCustomerApp] EXPO_PUBLIC_CUSTOMER_APP_URL protocol invalid → default')
      return DEFAULT_CUSTOMER_APP_WEB_URL
    }
    u.pathname = normalizePathname(u.pathname)
    let href = u.href
    if (href.endsWith('/')) {
      href = href.slice(0, -1)
    }
    u.searchParams.set('appWebView', '1')
    return u.toString()
  } catch {
    console.warn('[InsuranceCustomerApp] EXPO_PUBLIC_CUSTOMER_APP_URL parse error → default')
    return DEFAULT_CUSTOMER_APP_WEB_URL
  }
}

/** WebView 첫 요청·동일 출처 판별용 호스트명(소문자 비교는 호출부에서). */
export function serviceHostFromCustomerAppUrl(webViewUrl: string): string {
  try {
    return new URL(webViewUrl).hostname
  } catch {
    return new URL(DEFAULT_CUSTOMER_APP_WEB_URL).hostname
  }
}

/** 모듈 로드 시 한 번만: 번들에 박힌 시작 URL(로그·WebView source 공통). */
export const CUSTOMER_APP_WEB_VIEW_URL = resolveCustomerAppWebViewUrl()

export const CUSTOMER_APP_WEB_SERVICE_HOST = serviceHostFromCustomerAppUrl(CUSTOMER_APP_WEB_VIEW_URL)
