import { useCallback, useEffect, useState } from 'react'
import {
  fetchGovernmentAccessSummary,
  type GovernmentAccessSummary,
} from '../api/governmentSupportApi'

export function useGovernmentAccess(token?: string | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [summary, setSummary] = useState<GovernmentAccessSummary | null>(null)

  const load = useCallback(async () => {
    const trimmed = typeof token === 'string' ? token.trim() : ''
    if (!trimmed) return
    setLoading(true)
    setError(null)
    try {
      setSummary(await fetchGovernmentAccessSummary(trimmed))
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

  return { loading, error, summary, reload: load }
}
