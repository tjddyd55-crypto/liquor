import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import { fetchPlatformTenants } from '../../api/platformAdminApi'
import type { PlatformTenantRow } from '../../platformAdmin.types'
import TenantsListMobileView from './TenantsListMobileView'
import TenantsListPCView from './TenantsListPCView'

export type TenantsListViewProps = {
  items: PlatformTenantRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

export default function TenantsListPage() {
  const { token } = useAuth()
  const [items, setItems] = useState<PlatformTenantRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!token) return
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchPlatformTenants(token)
        setItems(res.items)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Tenant 목록을 불러오지 못했습니다.')
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
      <ResponsiveLayout<TenantsListViewProps>
        PC={TenantsListPCView}
        Mobile={TenantsListMobileView}
        viewProps={{ items, loading, error, reload }}
      />
    </>
  )
}
