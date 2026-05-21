import { useEffect, useState } from 'react'
import { resolveApiUrl } from '../lib/apiClient'

type VersionPayload = { message?: string }

/**
 * Shows APP_MESSAGE from GET /version when set (no auth).
 */
export function OperationalMessageBanner() {
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(resolveApiUrl('/api/version'), {
          headers: { Accept: 'application/json' },
        })
        if (!res.ok || cancelled) {
          return
        }
        const data = (await res.json()) as VersionPayload
        const next = typeof data.message === 'string' ? data.message.trim() : ''
        if (!cancelled) {
          setMessage(next)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!message) {
    return null
  }

  return (
    <div className="operational-message-banner" role="status">
      {message}
    </div>
  )
}
