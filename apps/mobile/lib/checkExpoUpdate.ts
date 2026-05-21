import { Alert } from 'react-native'
import * as Updates from 'expo-updates'
import { sendClientLog } from './sendClientLog'

/**
 * 업데이트 흐름의 단계. App.tsx 에서 이 값을 받아
 * "업데이트 적용 중" 오버레이 여부를 결정한다.
 *
 * - idle: 아직 아무 일도 없음(기본).
 * - checking: 서버에 업데이트가 있는지 조회 중.
 * - available: 업데이트가 있음이 확인되었고 곧 다운로드 시작.
 * - downloading: fetchUpdateAsync 실행 중.
 * - reloading: reloadAsync 호출 직전/중(화면이 곧 리로드됨).
 * - error: 실패. 사용자에겐 가만히 놔둬도 되지만 UX 로 안내 가능.
 *
 * expo-updates 는 fetch 진행률 이벤트를 노출하지 않으므로
 * "몇 % 받았는지" 는 표시할 수 없다. 상태 기반 텍스트만 보여준다.
 */
export type ExpoUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'reloading'
  | 'error'

export async function checkExpoUpdate(
  showAlert: (ready: boolean) => void,
  options?: { disableOTA?: boolean; onPhase?: (phase: ExpoUpdatePhase) => void },
): Promise<boolean> {
  const onPhase = options?.onPhase ?? (() => {})
  if (options?.disableOTA) {
    showAlert(false)
    return false
  }
  try {
    if (!Updates.isEnabled) {
      showAlert(false)
      return false
    }
    onPhase('checking')
    const update = await Updates.checkForUpdateAsync()
    console.log('update check:', update)
    void sendClientLog({
      type: 'expo-update-check',
      isAvailable: update.isAvailable,
      reason: update.reason ?? null,
    })
    const available = Boolean(update.isAvailable)
    onPhase(available ? 'available' : 'idle')
    showAlert(available)
    return available
  } catch (e) {
    console.log('expo update error:', e)
    void sendClientLog({
      type: 'expo-update-error',
      error: String(e),
    })
    onPhase('error')
    showAlert(false)
    return false
  }
}

export async function applyExpoUpdate(options?: {
  disableOTA?: boolean
  onPhase?: (phase: ExpoUpdatePhase) => void
}): Promise<void> {
  const onPhase = options?.onPhase ?? (() => {})
  if (options?.disableOTA) {
    void sendClientLog({ type: 'expo-ota-skipped', reason: 'disableOTA' })
    Alert.alert(
      '\uC54C\uB9BC',
      'OTA\uAC00 \uC77C\uC2DC \uC911\uB2E8\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uC2A4\uD1A0\uC5B4\uC5D0\uC11C \uCD5C\uC2E0 \uC571\uC744 \uC124\uCE58\uD574 \uC8FC\uC138\uC694.',
    )
    return
  }
  try {
    onPhase('downloading')
    await Updates.fetchUpdateAsync()
    void sendClientLog({ type: 'expo-update-fetched' })
    onPhase('reloading')
    await Updates.reloadAsync()
  } catch (e) {
    console.log('OTA failed, attempting reload rollback:', e)
    void sendClientLog({ type: 'expo-update-apply-error', error: String(e) })
    onPhase('error')
    try {
      await Updates.reloadAsync()
    } catch (err) {
      console.log('expo rollback reload failed:', err)
      void sendClientLog({
        type: 'expo-update-rollback-failed',
        error: String(err),
      })
      Alert.alert(
        '\uC54C\uB9BC',
        '\uC571 \uC7AC\uC124\uCE58\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4.',
      )
    }
  }
}
