export type ClientLogPayload = Record<string, unknown>

const DEFAULT_CLIENT_LOG_URL =
  'https://insurance-production-7bd8.up.railway.app/api/client-log'

/** 같은 앱 세션에서 반복 전송을 막을 로그 타입 */
const SEND_ONCE_PER_SESSION = new Set(['expo-update-error'])
const sentOnceThisSession = new Set<string>()

function resolveClientLogUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_CLIENT_LOG_URL?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_CLIENT_LOG_URL
}

export async function sendClientLog(data: ClientLogPayload): Promise<void> {
  const type = typeof data.type === 'string' ? data.type : ''
  if (type && SEND_ONCE_PER_SESSION.has(type)) {
    if (sentOnceThisSession.has(type)) {
      return
    }
    sentOnceThisSession.add(type)
  }

  const url = resolveClientLogUrl()
  const body = JSON.stringify({
    ...data,
    timestamp: Date.now(),
    platform: 'expo-customer',
  })
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
  } catch {
    /* telemetry 실패는 앱 동작에 영향 없음 */
  }
}
