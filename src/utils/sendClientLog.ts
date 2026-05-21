import { resolveApiUrl } from '../lib/apiClient'

export type ClientLogPayload = Record<string, unknown>

const DEFAULT_CLIENT_LOG_URL =
  'https://insurance-production-7bd8.up.railway.app/api/client-log'

function resolveClientLogUrl(): string {
  const fromEnv = String(import.meta.env.VITE_CLIENT_LOG_URL ?? '').trim()
  if (fromEnv) {
    return fromEnv
  }
  const resolved = resolveApiUrl('/api/client-log')
  if (/^https?:\/\//.test(resolved)) {
    return resolved
  }
  return DEFAULT_CLIENT_LOG_URL
}

/**
 * Fire-and-forget POST to server `/client-log` (or VITE_CLIENT_LOG_URL).
 * Safe to call from Web or Electron renderer; failures are swallowed silently.
 */
export async function sendClientLog(data: ClientLogPayload): Promise<void> {
  const url = resolveClientLogUrl()
  const body = JSON.stringify({
    ...data,
    timestamp: Date.now(),
    platform: 'web',
  })
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      credentials: 'omit',
    })
  } catch {
    return
  }
}
