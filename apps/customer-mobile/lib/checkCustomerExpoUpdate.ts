import * as Updates from 'expo-updates'
import type { ExpoUpdatePhase } from '../components/ExpoUpdateOverlay'
import { sendClientLog } from './sendClientLog'

function shouldAttemptExpoUpdate(): boolean {
  if (__DEV__) {
    return false
  }
  if (!Updates.isEnabled) {
    return false
  }
  if (Updates.isEmbeddedLaunch) {
    return false
  }
  return true
}

/**
 * 앱 시작 시 OTA 확인 → 다운로드 → 리로드.
 * 실패 시 기존 번들로 계속 실행하고, 사용자 UI/WebView 는 막지 않는다.
 */
export async function runCustomerExpoUpdateOnLaunch(options: {
  onPhase: (phase: ExpoUpdatePhase) => void
}): Promise<void> {
  const { onPhase } = options
  if (!shouldAttemptExpoUpdate()) {
    onPhase('idle')
    return
  }

  try {
    onPhase('checking')
    const update = await Updates.checkForUpdateAsync()
    if (!update.isAvailable) {
      onPhase('idle')
      return
    }
    onPhase('downloading')
    await Updates.fetchUpdateAsync()
    onPhase('reloading')
    await Updates.reloadAsync()
  } catch (e) {
    console.warn('[InsuranceCustomerApp] expo update check skipped:', e)
    void sendClientLog({
      type: 'expo-update-error',
      error: String(e),
    })
    onPhase('idle')
  }
}
