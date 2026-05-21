import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';

/**
 * 하단 시스템 네비만 inset — WebView가 홈/뒤로 영역까지 침범하지 않도록 함.
 * 상단은 App.tsx에서 useSafeAreaInsets().top만 패딩(노치).
 */
export function AppLayout({ children }: PropsWithChildren) {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['bottom']}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
});
