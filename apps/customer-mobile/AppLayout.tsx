import type { PropsWithChildren } from 'react'
import { StyleSheet } from 'react-native'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'

export function AppLayout({ children }: PropsWithChildren) {
  /**
   * 하단 safe-area 는 WebView 안 고객앱 CSS(`env(safe-area-inset-bottom)`)가 담당한다.
   * 여기서 `edges={['bottom']}` 까지 쓰면 RN 패딩 + 웹 fixed 하단바가 겹쳐 탭이 한 줄 위로 떠 보인다.
   */
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={[]}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
})
