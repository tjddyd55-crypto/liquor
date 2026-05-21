import { useCallback, useEffect, useRef, useState } from 'react';
import type { ElementRef } from 'react';
import {
  Alert,
  AppState,
  BackHandler,
  Button,
  Linking,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { AppLayout } from './AppLayout';
import { ExpoUpdateOverlay } from './components/ExpoUpdateOverlay';
import {
  applyExpoUpdate,
  checkExpoUpdate,
  type ExpoUpdatePhase,
} from './lib/checkExpoUpdate';
import { fetchClientVersionPolicy } from './lib/clientVersionPolicy';
import { sendClientLog } from './lib/sendClientLog';

/**
 * react-native-webview의 onShouldStartLoadWithRequest 반환값은
 * 순수 Android WebViewClient.shouldOverrideUrlLoading과 의미가 반대이다.
 * - true  → WebView가 해당 URL을 로드한다(네이티브 DO_NOT_OVERRIDE).
 * - false → 로드를 취소하고 앱에서 처리(네이티브 SHOULD_OVERRIDE).
 * 같은 호스트의 일반 내비게이션을 막으면 <a> 클릭·onClick·SPA 라우팅이 깨질 수 있다.
 */
const ALLOW_WEBVIEW_TO_LOAD_URL = true;
const CANCEL_WEBVIEW_LOAD = false;

const LOGIN_URL = 'https://insurance-production-7bd8.up.railway.app/login';

const SERVICE_HOST = new URL(LOGIN_URL).hostname;

/** 네이티브 캐시 비활성화 + (Android) 매 요청 네트워크 우선 — HTML/CSS/JS 번들 최신화 */
const WEBVIEW_ALWAYS_FRESH_PROPS = {
  cacheEnabled: false,
  cacheMode: 'LOAD_NO_CACHE' as const,
  incognito: true,
};

/** 초기 GET에만 적용(Android 제약). 이후 네비게이션은 WebView 캐시 설정이 더 큼 */
const WEB_FETCH_BYPASS_CACHE_HEADERS = {
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * 고객 등록 초대 URL — 앱 WebView에서는 절대 이 경로로 이동하지 않는다.
 * GA는 복사한 링크를 카톡 등으로 보내고, 고객은 외부 브라우저에서만 등록한다.
 */
const CUSTOMER_REGISTER_PATH = '/customer/register';

/** Android 패키지와 동일해야 함 (app.json android.package) */
const ANDROID_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.fchelper.app';
const SHOW_BUILD_INFO =
  __DEV__ || String(process.env.EXPO_PUBLIC_SHOW_BUILD_INFO ?? '').trim() === '1';

type MainWebViewLoadRequest = WebViewNavigation & { isTopFrame?: boolean };

function urlRefersToCustomerRegister(url: string): boolean {
  return url.toLowerCase().includes(CUSTOMER_REGISTER_PATH);
}

async function openExternal(url: string): Promise<boolean> {
  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (e) {
    if (__DEV__) {
      console.warn('openExternal failed', e);
    }
    return false;
  }
}

function looksLikePdfUrl(url: string): boolean {
  try {
    const { pathname } = new URL(url);
    if (/\.pdf$/i.test(pathname)) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return url.toLowerCase().includes('.pdf');
}

function getPathnameFromUrl(url: string): string {
  if (!url) {
    return '';
  }
  try {
    const { pathname } = new URL(url);
    return pathname.replace(/\/+$/, '') || '/';
  } catch {
    return '';
  }
}

/** 고객 등록 탭(?mode=create) — 이 화면에선 RN BackHandler 미등록, 웹 useBlocker만 */
function urlHasCustomerCreateMode(url: string): boolean {
  return url.includes('mode=create');
}

function AppContent() {
  const insets = useSafeAreaInsets();
  /** 앱 프로세스당 메인 WebView 1회 리마운트용(초기 로드만 강제 갱신) */
  const mainWebViewInstanceIdRef = useRef(`main-${Date.now()}`);

  const webViewRef = useRef<ElementRef<typeof WebView>>(null);
  const canGoBackRef = useRef(false);
  const currentUrlRef = useRef('');
  /** BackHandler 등록/해제를 URL 변경마다 맞추기 위한 상태 (onNavigationStateChange 동기화) */
  const [mainWebViewNavUrl, setMainWebViewNavUrl] = useState('');
  const lastExternalOpenUrlRef = useRef<string | null>(null);

  const scheduleExternalOpen = useCallback((url: string) => {
    if (lastExternalOpenUrlRef.current === url) {
      return;
    }
    lastExternalOpenUrlRef.current = url;

    void openExternal(url).then((opened) => {
      if (!opened && webViewRef.current) {
        webViewRef.current.injectJavaScript(
          `window.location.href = ${JSON.stringify(url)}; true;`,
        );
      }

      setTimeout(() => {
        if (lastExternalOpenUrlRef.current === url) {
          lastExternalOpenUrlRef.current = null;
        }
      }, 1000);
    });
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' || Platform.OS !== 'android') {
        return;
      }
      try {
        webViewRef.current?.clearCache?.(true);
      } catch {
        /* clearCache는 플랫폼/WebView 준비 시점에 따라 실패할 수 있음 */
      }
    });
    return () => sub.remove();
  }, []);

  const handleMainWebViewShouldStartLoad = useCallback(
    (request: MainWebViewLoadRequest) => {
      const requestUrl = request.url;
      const urlLower = requestUrl.toLowerCase();

      if (__DEV__) {
        console.log('[WEBVIEW NAV]', request);
      }

      if (urlRefersToCustomerRegister(requestUrl)) {
        return CANCEL_WEBVIEW_LOAD;
      }

      if (urlLower.startsWith('tel:') || urlLower.startsWith('mailto:')) {
        scheduleExternalOpen(requestUrl);
        return CANCEL_WEBVIEW_LOAD;
      }

      if (looksLikePdfUrl(requestUrl)) {
        scheduleExternalOpen(requestUrl);
        return CANCEL_WEBVIEW_LOAD;
      }

      try {
        const parsed = new URL(requestUrl);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return ALLOW_WEBVIEW_TO_LOAD_URL;
        }
        if (parsed.hostname.toLowerCase() !== SERVICE_HOST.toLowerCase()) {
          scheduleExternalOpen(requestUrl);
          return CANCEL_WEBVIEW_LOAD;
        }
      } catch {
        return ALLOW_WEBVIEW_TO_LOAD_URL;
      }

      return ALLOW_WEBVIEW_TO_LOAD_URL;
    },
    [scheduleExternalOpen],
  );

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }

    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const url = currentUrlRef.current;
      const path = getPathnameFromUrl(url);

      if (path.startsWith('/login') || path.startsWith('/dashboard')) {
        Alert.alert('앱을 종료하시겠습니까?', '', [
          { text: '취소', style: 'cancel' },
          { text: '확인', onPress: () => BackHandler.exitApp() },
        ]);
        return true;
      }

      // 고객 등록: 네이티브 Alert·goBack 금지 → WebView history POP이 나가면 웹 blocker와 이중 확인됨.
      // 웹에서만 ExitConfirmDialog 1회 (insurance-native-back 커스텀 이벤트).
      if (url.includes('mode=create')) {
        webViewRef.current?.injectJavaScript(
          "(function(){try{window.dispatchEvent(new CustomEvent('insurance-native-back',{detail:{reason:'customer-create-exit'}}));}catch(e){}true;})();",
        );
        return true;
      }

      if (path.startsWith('/application/write')) {
        Alert.alert('자동차 신청 작성을 중지하시겠습니까?', '', [
          { text: '취소', style: 'cancel' },
          {
            text: '확인',
            onPress: () => webViewRef.current?.goBack(),
          },
        ]);
        return true;
      }

      if (canGoBackRef.current && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }

      return false;
    });

    return () => sub.remove();
  }, []);

  const mainWebPaddingTop =
    Platform.OS === 'ios'
      ? Math.max(0, insets.top - 7)
      : Math.max(0, insets.top - 4);

  return (
    <View style={styles.container}>
      <StatusBar style="light" backgroundColor="#0f1115" />

      <View
        style={[styles.mainWebWrap, { paddingTop: mainWebPaddingTop }]}
      >
        <WebView
          key={mainWebViewInstanceIdRef.current}
          ref={webViewRef}
          source={{ uri: LOGIN_URL, headers: WEB_FETCH_BYPASS_CACHE_HEADERS }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          {...WEBVIEW_ALWAYS_FRESH_PROPS}
          onShouldStartLoadWithRequest={handleMainWebViewShouldStartLoad}
          onNavigationStateChange={(nav) => {
            const url = nav.url ?? '';
            currentUrlRef.current = url;
            canGoBackRef.current = nav.canGoBack;
            setMainWebViewNavUrl(url);
          }}
        />
      </View>
    </View>
  );
}

export default function App() {
  const [updateReady, setUpdateReady] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [otaDisabled, setOtaDisabled] = useState(false);
  const [operatorMessage, setOperatorMessage] = useState('');
  /*
   * OTA 단계. checkExpoUpdate/applyExpoUpdate 가 진입할 때마다 콜백으로 갱신되고,
   * ExpoUpdateOverlay 는 이 값을 보고 오버레이 표시 여부를 결정한다.
   * 데스크탑의 DesktopUpdateDialog 와 비슷한 UX 를 상태기계로 표현.
   */
  const [updatePhase, setUpdatePhase] = useState<ExpoUpdatePhase>('idle');

  useEffect(() => {
    void (async () => {
      const policy = await fetchClientVersionPolicy();
      setForceUpdate(policy.forceUpdateActive);
      setOtaDisabled(policy.disableOTA);
      setOperatorMessage(policy.message);
      if (policy.forceUpdateActive) {
        void sendClientLog({
          type: 'expo-force-update',
          version: Constants.expoConfig?.version ?? '',
        });
      }
      const updateAvailable = await checkExpoUpdate(setUpdateReady, {
        disableOTA: policy.disableOTA,
        onPhase: setUpdatePhase,
      });
      if (updateAvailable && !policy.disableOTA) {
        await applyExpoUpdate({
          disableOTA: policy.disableOTA,
          onPhase: setUpdatePhase,
        });
      }
    })();
  }, []);

  const openStoreForRequiredUpdate = useCallback(async () => {
    const iosUrl = process.env.EXPO_PUBLIC_IOS_APP_STORE_URL?.trim();
    const url =
      Platform.OS === 'ios'
        ? iosUrl && iosUrl.length > 0
          ? iosUrl
          : 'https://apps.apple.com'
        : ANDROID_PLAY_STORE_URL;
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) {
        await Linking.openURL(url);
      }
    } catch {
      /* ignore */
    }
  }, []);

  if (forceUpdate) {
    return (
      <View style={styles.forceGateRoot} pointerEvents="auto">
        <View style={styles.forceGateInner}>
          <Text style={styles.forceGateTitle}>
            {'\uC5C5\uB370\uC774\uD2B8 \uD6C4 \uC0AC\uC6A9 \uAC00\uB2A5\uD569\uB2C8\uB2E4'}
          </Text>
          {operatorMessage ? (
            <Text style={styles.operatorMessage}>{operatorMessage}</Text>
          ) : null}
          {otaDisabled ? (
            <Text style={styles.forceGateSubtitle}>
              {
                '\uC6D0\uACA9 OTA\uAC00 \uC77C\uC2DC \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2A4\uD1A0\uC5B4\uC5D0\uC11C \uCD5C\uC2E0 \uC571\uC744 \uC124\uCE58\uD574 \uC8FC\uC138\uC694.'
              }
            </Text>
          ) : (
            <Text style={styles.forceGateSubtitle}>
              {
                '\uC544\uB798 \uBC84\uD2BC\uC73C\uB85C \uCD5C\uC2E0 \uBC84\uC804\uC744 \uBC1B\uC544 \uC8FC\uC138\uC694.'
              }
            </Text>
          )}
          {otaDisabled ? (
            <Button
              title={'\uC2A4\uD1A0\uC5B4\uC5D0\uC11C \uC5C5\uB370\uC774\uD2B8'}
              onPress={() => void openStoreForRequiredUpdate()}
            />
          ) : (
            <Button
              title={'\uC5C5\uB370\uC774\uD2B8'}
              onPress={() =>
                void applyExpoUpdate({
                  disableOTA: otaDisabled,
                  onPhase: setUpdatePhase,
                })
              }
            />
          )}
          {SHOW_BUILD_INFO ? (
            <View style={styles.expoBuildInfoBlock}>
              <Text style={styles.expoBuildInfoVersionGate}>
                {'\uBC84\uC804: '}
                {Constants.expoConfig?.version ?? '\u2014'}
              </Text>
              <Text style={styles.expoBuildInfoIdGate}>
                {'\uC5C5\uB370\uC774\uD2B8 ID: '}
                {Updates.updateId ?? '\u2014'}
              </Text>
              {!otaDisabled ? (
                <Button
                  title={'\uC5C5\uB370\uC774\uD2B8 \uD655\uC778'}
                  onPress={() =>
                    void checkExpoUpdate(setUpdateReady, {
                      disableOTA: otaDisabled,
                      onPhase: setUpdatePhase,
                    })
                  }
                />
              ) : null}
            </View>
          ) : null}
        </View>
        <ExpoUpdateOverlay phase={updatePhase} />
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      {operatorMessage ? (
        <View style={styles.operatorMessageStrip} pointerEvents="box-none">
          <Text style={styles.operatorMessage}>{operatorMessage}</Text>
        </View>
      ) : null}
      <AppLayout>
        <AppContent />
      </AppLayout>
      {updateReady && !otaDisabled ? (
        <View style={styles.expoUpdateBanner} pointerEvents="box-none">
          <Button
            title={'\uC5C5\uB370\uC774\uD2B8 \uC801\uC6A9'}
            onPress={() =>
              void applyExpoUpdate({
                disableOTA: otaDisabled,
                onPhase: setUpdatePhase,
              })
            }
          />
        </View>
      ) : null}
      {SHOW_BUILD_INFO ? (
        <View style={styles.expoBuildInfoFooter} pointerEvents="box-none">
          <Text style={styles.expoBuildInfoVersion}>
            {'\uBC84\uC804: '}
            {Constants.expoConfig?.version ?? '\u2014'}
          </Text>
          <Text style={styles.expoBuildInfoUpdateId}>
            {'\uC5C5\uB370\uC774\uD2B8 ID: '}
            {Updates.updateId ?? '\u2014'}
          </Text>
          {!otaDisabled ? (
            <Button
              title={'\uC5C5\uB370\uC774\uD2B8 \uD655\uC778'}
              onPress={() =>
                void checkExpoUpdate(setUpdateReady, {
                  disableOTA: otaDisabled,
                  onPhase: setUpdatePhase,
                })
              }
            />
          ) : null}
        </View>
      ) : null}
      <ExpoUpdateOverlay phase={updatePhase} />
    </View>
  );
}

const styles = StyleSheet.create({
  appRoot: {
    flex: 1,
  },
  forceGateRoot: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#b91c1c',
    padding: 24,
  },
  forceGateInner: {
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    gap: 16,
  },
  forceGateTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  forceGateSubtitle: {
    color: '#ffeeee',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 4,
  },
  operatorMessageStrip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#1a1a1a',
  },
  operatorMessage: {
    color: '#fde047',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  expoUpdateBanner: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 52 : 12,
    left: 12,
    right: 12,
    zIndex: 1000,
    alignItems: 'center',
  },
  expoBuildInfoBlock: {
    marginTop: 16,
    width: '100%',
    alignItems: 'center',
    gap: 6,
  },
  expoBuildInfoVersionGate: {
    fontSize: 12,
    opacity: 0.85,
    color: '#fff',
    textAlign: 'center',
  },
  expoBuildInfoIdGate: {
    fontSize: 10,
    opacity: 0.7,
    color: '#e2e8f0',
    textAlign: 'center',
  },
  expoBuildInfoFooter: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: Platform.OS === 'ios' ? 28 : 12,
    zIndex: 50,
    alignItems: 'center',
    gap: 6,
    paddingBottom: 4,
  },
  expoBuildInfoVersion: {
    fontSize: 12,
    opacity: 0.65,
    color: '#94a3b8',
    textAlign: 'center',
  },
  expoBuildInfoUpdateId: {
    fontSize: 10,
    opacity: 0.55,
    color: '#64748b',
    textAlign: 'center',
  },
  container: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  webview: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    marginTop: 0,
    paddingTop: 0,
    backgroundColor: '#0f1115',
  },
  mainWebWrap: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: '#0f1115',
  },
});
