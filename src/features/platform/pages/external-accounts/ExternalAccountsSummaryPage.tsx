import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import { fetchPlatformExternalSummary } from '../../api/platformAdminApi'
import type { PlatformExternalAccountsSummaryResponse } from '../../platformAdmin.types'
import ExternalAccountsSummaryMobileView from './ExternalAccountsSummaryMobileView'
import ExternalAccountsSummaryPCView from './ExternalAccountsSummaryPCView'

export type ExternalAccountsSummaryViewProps = {
  loading: boolean
  error: string | null
  notFound: boolean
  notFoundMessage: string | null
  summary: PlatformExternalAccountsSummaryResponse | null
  reload: () => void
}

export default function ExternalAccountsSummaryPage() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [notFoundMessage, setNotFoundMessage] = useState<string | null>(null)
  const [summary, setSummary] = useState<PlatformExternalAccountsSummaryResponse | null>(null)

  const reload = useCallback(() => {
    if (!token) return
    void (async () => {
      setLoading(true)
      setError(null)
      setNotFound(false)
      setNotFoundMessage(null)
      try {
        const res = await fetchPlatformExternalSummary(token)
        setSummary(res)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setSummary(null)
          setNotFound(true)
          setNotFoundMessage(e.message)
          return
        }
        setError(e instanceof ApiError ? e.message : '외부 계정 요약을 불러오지 못했습니다.')
        setSummary(null)
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  useEffect(() => {
    reload()
  }, [reload])

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
      </div>
      <ResponsiveLayout<ExternalAccountsSummaryViewProps>
        PC={ExternalAccountsSummaryPCView}
        Mobile={ExternalAccountsSummaryMobileView}
        viewProps={{ loading, error, notFound, notFoundMessage, summary, reload }}
      />
    </>
  )
}
