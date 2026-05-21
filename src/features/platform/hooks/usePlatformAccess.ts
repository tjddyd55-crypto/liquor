import { useCallback, useEffect, useState } from 'react'

import { fetchPlatformAccessSummary } from '../api/platformAdminApi'
import type { PlatformAccessSummary } from '../platformAdmin.types'

export type UsePlatformAccessResult = {
  loading: boolean
  error: unknown
  summary: PlatformAccessSummary | null
  /** token 이 있을 때만 네트워크 요청. 수동 재조회용. */
  reload: () => Promise<void>
}

/**
 * 플랫폼 접근 요약(GET /api/admin/platform/me/access).
 * `token` 이 없거나 공백이면 요청하지 않는다(AuthProvider 미연동 1차).
 */
export function usePlatformAccess(token?: string | null): UsePlatformAccessResult {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [summary, setSummary] = useState<PlatformAccessSummary | null>(null)

  const load = useCallback(async () => {
    const trimmed = typeof token === 'string' ? token.trim() : ''
    if (!trimmed) {
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPlatformAccessSummary(trimmed)
      setSummary(data)
    } catch (e) {
      setError(e)
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    const trimmed = typeof token === 'string' ? token.trim() : ''
    if (!trimmed) {
      setSummary(null)
      setError(null)
      setLoading(false)
      return
    }
    void load()
  }, [token, load])

  return {
    loading,
    error,
    summary,
    reload: load,
  }
}
