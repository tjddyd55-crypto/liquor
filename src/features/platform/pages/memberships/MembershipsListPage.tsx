import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import { ApiError } from '../../../../lib/apiClient'
import { fetchPlatformMemberships } from '../../api/platformAdminApi'
import type { PlatformMembershipRow } from '../../platformAdmin.types'
import MembershipsListMobileView from './MembershipsListMobileView'
import MembershipsListPCView from './MembershipsListPCView'

export type MembershipsListViewProps = {
  items: PlatformMembershipRow[]
  loading: boolean
  error: string | null
  reload: () => void
}

export default function MembershipsListPage() {
  const { token } = useAuth()
  const [items, setItems] = useState<PlatformMembershipRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(() => {
    if (!token) return
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetchPlatformMemberships(token)
        setItems(res.items)
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Membership 목록을 불러오지 못했습니다.')
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
      <ResponsiveLayout<MembershipsListViewProps>
        PC={MembershipsListPCView}
        Mobile={MembershipsListMobileView}
        viewProps={{ items, loading, error, reload }}
      />
    </>
  )
}
