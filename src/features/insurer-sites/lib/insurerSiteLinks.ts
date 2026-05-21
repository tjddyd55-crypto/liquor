/** 사용자 화면: 외부 링크만 허용하고 잘못된 URL은 무시한다. */

import { getPublicOrigin } from '../../../lib/publicOrigin'

export function safeOpenUrl(raw: string | undefined | null): void {
  const u = String(raw ?? '').trim()
  if (!u) return
  try {
    const parsed = new URL(u)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return
    window.open(parsed.href, '_blank', 'noopener,noreferrer')
  } catch {
    /* invalid URL */
  }
}

/**
 * 표시용 로고 URL — `/` 로 시작하는 자체 호스팅 경로만 허용 (외부 hotlink 금지).
 * Electron(file://)에서는 상대 경로가 로컬 번들로 해석되므로 `VITE_BASE_URL` 등 공개 origin을 붙인다.
 */
export function logoSrcForUi(logoPath: string | undefined | null): string {
  const path = String(logoPath ?? '').trim()
  if (!path.startsWith('/')) return ''

  const envOrigin = getPublicOrigin().trim().replace(/\/$/, '')
  if (envOrigin) {
    return `${envOrigin}${path}`
  }
  if (typeof window !== 'undefined') {
    const o = window.location?.origin ?? ''
    if (o && o !== 'null' && !/^file:/i.test(o)) {
      return `${o.replace(/\/$/, '')}${path}`
    }
  }
  return path
}
