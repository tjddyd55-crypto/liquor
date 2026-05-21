/**
 * 클립보드 복사 — HTTPS·사용자 제스처 컨텍스트에서 `navigator.clipboard` 우선,
 * WebView/Electron/구형 브라우저에서는 textarea + execCommand fallback.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const t = String(text ?? '').trim()
  if (!t) {
    return false
  }

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(t)
      return true
    } catch {
      /* fall through to fallback */
    }
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = t
  textarea.setAttribute('readonly', 'readonly')
  textarea.setAttribute('aria-hidden', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'

  document.body.appendChild(textarea)

  try {
    textarea.focus({ preventScroll: true })
    textarea.select()
    textarea.setSelectionRange(0, t.length)
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}
