export type ClientLogPayload = Record<string, unknown>

const DEFAULT_CLIENT_LOG_URL =
  'https://insurance-production-7bd8.up.railway.app/api/client-log'

function resolveClientLogUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_CLIENT_LOG_URL?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_CLIENT_LOG_URL
}

export async function sendClientLog(data: ClientLogPayload): Promise<void> {
  const url = resolveClientLogUrl()
  const body = JSON.stringify({
    ...data,
    timestamp: Date.now(),
    platform: 'expo',
  })
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch {
    console.log('[client-log] send failed')
  }
}
