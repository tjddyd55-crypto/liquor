/**
 * Expo OTA 업데이트가 백그라운드로 진행되는 동안 사용자에게 상태를 보여 주는 풀스크린 오버레이.
 *
 * 설계 의도:
 *   - 데스크탑(Electron) 의 DesktopUpdateDialog 와 UX 톤을 맞춰 "업데이트 중" 을 명확히 전달.
 *   - expo-updates 는 다운로드 진행률 이벤트를 제공하지 않으므로,
 *     "%" 가 아니라 단계(phase) 기반 텍스트로만 안내한다.
 *   - 취소 버튼은 두지 않는다 — OTA 는 짧고(수 초) 중단하면 앱 상태가 혼란스러워진다.
 *     대신 phase 가 reloading 이 되기 전까지는 WebView 가 보이도록 App.tsx 가 렌더를 유지한다.
 *
 * 이 컴포넌트는 phase 값만 받아 UI 만 그린다. 상태 전이/Logging 은 App.tsx 책임.
 */

import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'

import type { ExpoUpdatePhase } from '../lib/checkExpoUpdate'

interface Props {
  phase: ExpoUpdatePhase
}

/** 보여줄 phase 만 화이트리스트. 그 외(idle/checking/error)는 오버레이를 감춘다. */
const VISIBLE_PHASES: ReadonlyArray<ExpoUpdatePhase> = ['downloading', 'reloading']

function phaseTitle(phase: ExpoUpdatePhase): string {
  switch (phase) {
    case 'downloading':
      return '\uC5C5\uB370\uC774\uD2B8\uB97C \uBC1B\uACE0 \uC788\uC5B4\uC694' /* 업데이트를 받고 있어요 */
    case 'reloading':
      return '\uC5C5\uB370\uC774\uD2B8\uB97C \uC801\uC6A9\uD558\uACE0 \uC788\uC5B4\uC694' /* 업데이트를 적용하고 있어요 */
    default:
      return ''
  }
}

function phaseSubtitle(phase: ExpoUpdatePhase): string {
  if (phase === 'reloading') {
    return '\uC7A0\uC2DC \uD6C4 \uC571\uC774 \uC790\uB3D9\uC73C\uB85C \uC7AC\uC2DC\uC791\uB429\uB2C8\uB2E4.'
    /* 잠시 후 앱이 자동으로 재시작됩니다. */
  }
  return '\uC18C\uC694 \uC2DC\uAC04\uC740 \uC218 \uCD08\uC785\uB2C8\uB2E4. \uC571\uC744 \uB2EB\uC9C0 \uB9C8\uC138\uC694.'
  /* 소요 시간은 수 초입니다. 앱을 닫지 마세요. */
}

export function ExpoUpdateOverlay({ phase }: Props) {
  const visible = VISIBLE_PHASES.includes(phase)
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        /* 뒤로가기 키로 닫히지 않도록 no-op. OTA 는 수 초 내에 끝난다. */
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.title}>{phaseTitle(phase)}</Text>
          <Text style={styles.subtitle}>{phaseSubtitle(phase)}</Text>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 17, 21, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 360,
  },
  title: {
    color: '#111827',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
  },
  subtitle: {
    color: '#4b5563',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
})
