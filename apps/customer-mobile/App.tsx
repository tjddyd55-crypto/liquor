import { useEffect, useRef, useState } from 'react'
import type { ElementRef } from 'react'
import { Alert, BackHandler, Linking, Platform, StyleSheet, View } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview'
import { AppLayout } from './AppLayout'
import { ExpoUpdateOverlay, type ExpoUpdatePhase } from './components/ExpoUpdateOverlay'
import { runCustomerExpoUpdateOnLaunch } from './lib/checkCustomerExpoUpdate'
import {
  CUSTOMER_APP_WEB_SERVICE_HOST,
  CUSTOMER_APP_WEB_VIEW_URL,
} from './customerAppWebViewConfig'

/**
 * incognito 를 켜면(특히 Android WebView) localStorage/DOM Storage 가 세션 단위로 격리되거나
 * 쓰기가 반영되지 않는 경우가 있어, 고객앱(/customer-app) 세션(customerAppSession)이 남지 않고
 * 홈·연결 화면이 깨지는 문제가 발생할 수 있다. 캐시 무효화만 유지하고 비시크릿 컨텍스트를 쓴다.
 */
const WEBVIEW_ALWAYS_FRESH_PROPS = {
  cacheEnabled: false,
  cacheMode: 'LOAD_NO_CACHE' as const,
  incognito: false,
}

const WEB_FETCH_BYPASS_CACHE_HEADERS = {
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
}

type MainWebViewLoadRequest = WebViewNavigation & { isTopFrame?: boolean }

/** 문서 로드 전에 실행 — RN 브릿지보다 먼저 WebView 여부를 웹·localStorage 에 심는다 */
const INJECT_WEBVIEW_ENV_FLAG = `(function(){try{window.__INSURANCE_CUSTOMER_APP_WEBVIEW__=true;}catch(e){}try{localStorage.setItem('insurance.customer-app.webview','1');}catch(e){}})();true;`

function looksLikeFileDownload(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('.pdf') || lower.includes('/download')
}

async function openExternal(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url)
    if (!supported) return false
    await Linking.openURL(url)
    return true
  } catch {
    return false
  }
}

function buildCustomerAppConnectUrl(baseHref: string, linkCode: string): string {
  const code = encodeURIComponent(linkCode)
  try {
    const u = new URL(baseHref)
    const p = u.pathname.replace(/\/$/, '')
    u.pathname = `${p}/connect/${code}`
    return u.toString()
  } catch {
    return `${baseHref.replace(/\/?$/, '')}/connect/${code}`
  }
}

/** insurancecustomer://connect?code=… 또는 …/connect/CODE */
function parseInsuranceCustomerDeepLink(url: string): string | null {
  const raw = String(url ?? '').trim()
  if (!/^insurancecustomer:\/\//i.test(raw)) {
    return null
  }
  const pathMatch = /^insurancecustomer:\/\/connect\/([^?#/]+)/i.exec(raw)
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim().toUpperCase()
    } catch {
      return pathMatch[1].trim().toUpperCase()
    }
  }
  try {
    const u = new URL(raw.replace(/^insurancecustomer:/i, 'https:'))
    const q = u.searchParams.get('code') ?? u.searchParams.get('token')
    if (q?.trim()) {
      return q.trim().toUpperCase()
    }
  } catch {
    /* noop */
  }
  return null
}

const applyConnectFromNativeRef = { current: null as null | ((code: string) => void) }

function AppContent() {
  const insets = useSafeAreaInsets()
  const webViewRef = useRef<ElementRef<typeof WebView>>(null)
  const canGoBackRef = useRef(false)
  const currentUrlRef = useRef('')
  const [webViewUri, setWebViewUri] = useState(CUSTOMER_APP_WEB_VIEW_URL)

  useEffect(() => {
    console.log('[InsuranceCustomerApp] WebView 시작 URL:', CUSTOMER_APP_WEB_VIEW_URL)
  }, [])

  useEffect(() => {
    applyConnectFromNativeRef.current = (code: string) => {
      const c = String(code ?? '').trim()
      if (!c) return
      const next = buildCustomerAppConnectUrl(CUSTOMER_APP_WEB_VIEW_URL, c)
      setWebViewUri(next)
    }
    return () => {
      applyConnectFromNativeRef.current = null
    }
  }, [])

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url) return
      const code = parseInsuranceCustomerDeepLink(url)
      if (code && applyConnectFromNativeRef.current) {
        applyConnectFromNativeRef.current(code)
      }
    }
    void Linking.getInitialURL().then(handleUrl)
    const sub = Linking.addEventListener('url', (ev) => handleUrl(ev.url))
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const currentUrl = currentUrlRef.current
      if (currentUrl.includes('/customer-app') && !canGoBackRef.current) {
        Alert.alert('앱을 종료하시겠습니까?', '', [
          { text: '취소', style: 'cancel' },
          { text: '확인', onPress: () => BackHandler.exitApp() },
        ])
        return true
      }
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack()
        return true
      }
      return false
    })
    return () => sub.remove()
  }, [])

  const mainWebPaddingTop = Platform.OS === 'ios' ? Math.max(0, insets.top - 7) : Math.max(0, insets.top - 4)

  const handleWebMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(String(event.nativeEvent.data ?? '{}')) as { type?: string }
      const t = data?.type
      if (t !== 'CUSTOMER_APP_CLOSE' && t !== 'CLOSE_CUSTOMER_APP') {
        return
      }
      /** 웹 [닫기]: 고객앱 WebView 전용 — Android 는 프로세스 종료, iOS 는 뒤로가기·홈 폴백 */
      if (Platform.OS === 'android') {
        BackHandler.exitApp()
        return
      }
      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack()
        return
      }
      const home = CUSTOMER_APP_WEB_VIEW_URL
      if (webViewRef.current) {
        webViewRef.current.injectJavaScript(`window.location.replace(${JSON.stringify(home)}); true;`)
      } else {
        setWebViewUri(home)
      }
    } catch {
      /* noop */
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0f1115" />
      <View style={[styles.mainWebWrap, { paddingTop: mainWebPaddingTop }]}>
        <WebView
          ref={webViewRef}
          source={{ uri: webViewUri, headers: WEB_FETCH_BYPASS_CACHE_HEADERS }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          {...WEBVIEW_ALWAYS_FRESH_PROPS}
          injectedJavaScriptBeforeContentLoaded={INJECT_WEBVIEW_ENV_FLAG}
          onMessage={handleWebMessage}
          onLoadEnd={(e) => {
            const url = e.nativeEvent.url
            if (url) {
              console.log('[InsuranceCustomerApp] WebView 로드 완료 url:', url)
            }
          }}
          onHttpError={(e) => {
            console.warn('[InsuranceCustomerApp] WebView HTTP', e.nativeEvent.statusCode, e.nativeEvent.url)
          }}
          onError={(e) => {
            console.warn('[InsuranceCustomerApp] WebView error:', e.nativeEvent.description, e.nativeEvent.url)
          }}
          onShouldStartLoadWithRequest={(request: MainWebViewLoadRequest) => {
            const requestUrl = request.url
            const lower = requestUrl.toLowerCase()
            if (lower.startsWith('tel:') || lower.startsWith('mailto:') || looksLikeFileDownload(requestUrl)) {
              void openExternal(requestUrl)
              return false
            }
            if (/^insurancecustomer:\/\//i.test(requestUrl)) {
              const code = parseInsuranceCustomerDeepLink(requestUrl)
              if (code && applyConnectFromNativeRef.current) {
                applyConnectFromNativeRef.current(code)
              }
              return false
            }
            try {
              const parsed = new URL(requestUrl)
              if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true
              if (parsed.hostname.toLowerCase() !== CUSTOMER_APP_WEB_SERVICE_HOST.toLowerCase()) {
                void openExternal(requestUrl)
                return false
              }
            } catch {
              return true
            }
            return true
          }}
          onNavigationStateChange={(nav) => {
            currentUrlRef.current = nav.url ?? ''
            canGoBackRef.current = nav.canGoBack
          }}
        />
      </View>
    </View>
  )
}

export default function App() {
  /*
   * OTA 단계 상태.
   * on-launch 에서 체크 → 다운로드 → 리로드까지 자동으로 진행되며,
   * ExpoUpdateOverlay 가 downloading/reloading 구간에서만 풀스크린 안내를 보여 준다.
   * 사용자가 "왜 갑자기 앱이 재시작됐는지" 모르는 현상을 막는 것이 핵심 목적.
   */
  const [updatePhase, setUpdatePhase] = useState<ExpoUpdatePhase>('idle')

  useEffect(() => {
    let mounted = true
    void runCustomerExpoUpdateOnLaunch({
      onPhase: (phase) => {
        if (mounted) {
          setUpdatePhase(phase)
        }
      },
    })
    return () => {
      mounted = false
    }
  }, [])

  return (
    <AppLayout>
      <AppContent />
      <ExpoUpdateOverlay phase={updatePhase} />
    </AppLayout>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  webview: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: '#0f1115',
  },
  mainWebWrap: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: '#0f1115',
  },
})
