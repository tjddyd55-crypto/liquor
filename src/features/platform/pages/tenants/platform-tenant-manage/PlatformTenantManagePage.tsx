import { Link, useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../../components/ResponsiveLayout'
import { usePlatformTenantManageState } from '../../../hooks/usePlatformTenantManageState'
import PlatformTenantManageMobileView from './PlatformTenantManageMobileView'
import PlatformTenantManagePCView from './PlatformTenantManagePCView'

export default function PlatformTenantManagePage() {
  const params = useParams<{ tenantId: string }>()
  const tenantId = String(params.tenantId ?? '').trim()

  const state = usePlatformTenantManageState(tenantId)

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform/tenants" className="platform-admin-page__back">
          ← Tenant 목록
        </Link>
      </div>
      <ResponsiveLayout
        PC={PlatformTenantManagePCView}
        Mobile={PlatformTenantManageMobileView}
        viewProps={state}
      />
    </>
  )
}
