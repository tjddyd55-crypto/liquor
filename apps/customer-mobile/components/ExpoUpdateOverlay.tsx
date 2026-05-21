/**
 * 고객용 모바일 앱의 OTA 진행 오버레이.
 *
 * apps/mobile 의 동명 컴포넌트와 동일한 UX 를 제공한다.
 * 두 앱이 독립 Expo 프로젝트라 공용 모듈을 바로 공유하기 어렵기 때문에 의도적으로 복제했다.
 * 향후 공용 패키지(`@insurance/mobile-ui` 등) 로 추출할 수 있는 후보다.
 */

import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native'

export type ExpoUpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'reloading'
  | 'error'

interface Props {
  phase: ExpoUpdatePhase
}

const VISIBLE_PHASES: ReadonlyArray<ExpoUpdatePhase> = ['downloading', 'reloading']

function phaseTitle(phase: ExpoUpdatePhase): string {
  switch (phase) {
    case 'downloading':
      return '\uC5C5\uB370\uC774\uD2B8\uB97C \uBC1B\uACE0 \uC788\uC5B4\uC694'
    case 'reloading':
      return '\uC5C5\uB370\uC774\uD2B8\uB97C \uC801\uC6A9\uD558\uACE0 \uC788\uC5B4\uC694'
    default:
      return ''
  }
}

function phaseSubtitle(phase: ExpoUpdatePhase): string {
  if (phase === 'reloading') {
    return '\uC7A0\uC2DC \uD6C4 \uC571\uC774 \uC790\uB3D9\uC73C\uB85C \uC7AC\uC2DC\uC791\uB429\uB2C8\uB2E4.'
  }
  return '\uC18C\uC694 \uC2DC\uAC04\uC740 \uC218 \uCD08\uC785\uB2C8\uB2E4. \uC571\uC744 \uB2EB\uC9C0 \uB9C8\uC138\uC694.'
}

export function ExpoUpdateOverlay({ phase }: Props) {
  const visible = VISIBLE_PHASES.includes(phase)
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
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
