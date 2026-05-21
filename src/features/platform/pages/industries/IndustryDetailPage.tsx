import { Link, useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import { useIndustryAdminDetailState, type UseIndustryAdminDetailStateResult } from '../../hooks/useIndustryAdminDetailState'
import IndustryDetailMobileView from './IndustryDetailMobileView'
import IndustryDetailPCView from './IndustryDetailPCView'

export type IndustryDetailViewProps = UseIndustryAdminDetailStateResult & {
  industryIdRaw: string
  token: string | null
}

export default function IndustryDetailPage() {
  const { industryId: industryIdRaw } = useParams<{ industryId: string }>()
  const { token } = useAuth()
  const state = useIndustryAdminDetailState(industryIdRaw, token)

  const viewProps: IndustryDetailViewProps = {
    ...state,
    industryIdRaw: industryIdRaw ?? '',
    token,
  }

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform/industries" className="platform-admin-page__back">
          ← Industry 목록
        </Link>
      </div>
      <ResponsiveLayout<IndustryDetailViewProps>
        PC={IndustryDetailPCView}
        Mobile={IndustryDetailMobileView}
        viewProps={viewProps}
      />
    </>
  )
}
