/**
 * Absolute origin for shareable links (invite URLs, resolving relative asset URLs).
 * In Electron (file://), use VITE_BASE_URL from .env.production, or VITE_API_URL if same host.
 */
export function getPublicOrigin(): string {
  const base = String(import.meta.env.VITE_BASE_URL ?? '').trim().replace(/\/$/, '')
  if (base) {
    return base
  }
  const apiFallback = String(import.meta.env.VITE_API_URL ?? '').trim().replace(/\/$/, '')
  if (apiFallback) {
    return apiFallback
  }
  if (typeof window !== 'undefined') {
    const o = window.location?.origin
    if (o && o !== 'null' && !/^file:/i.test(o)) {
      return o
    }
  }
  return ''
}
