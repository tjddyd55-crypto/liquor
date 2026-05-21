import { copyTextToClipboard } from '../../../lib/clipboard'

/** WebView: touchstart·mousedown·합성 click 연속 시 복사/알림 중복 방지 */
export const INVITE_COPY_POINTER_DEBOUNCE_MS = 450

/**
 * 고객 등록 초대 링크를 클립보드에 복사한다.
 * @deprecated 이름 유지 — `copyTextToClipboard` 와 동일.
 */
export async function copyTextWithWebViewFallback(text: string): Promise<boolean> {
  return copyTextToClipboard(text)
}
