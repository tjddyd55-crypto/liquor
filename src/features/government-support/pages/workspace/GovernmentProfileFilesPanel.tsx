import { useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useAuth } from '../../../auth/AuthProvider'
import GovernmentProfileFilesPageMobile from './files/GovernmentProfileFilesPageMobile'
import GovernmentProfileFilesPagePC from './files/GovernmentProfileFilesPagePC'
import type { GovernmentProfileFilesViewProps } from './files/governmentProfileFilesViewProps'

export default function GovernmentProfileFilesPanel() {
  const { profileId: profileIdParam } = useParams()
  const profileId = String(profileIdParam ?? '').trim()
  const { token } = useAuth()

  if (!profileId) {
    return (
      <div className="content-wrapper page-shell">
        <p>사업장을 먼저 선택해 주세요.</p>
      </div>
    )
  }

  if (!token?.trim()) {
    return (
      <div className="content-wrapper page-shell">
        <p>로그인이 필요합니다.</p>
      </div>
    )
  }

  const viewProps: GovernmentProfileFilesViewProps = { token, profileId }

  return (
    <ResponsiveLayout<GovernmentProfileFilesViewProps>
      PC={GovernmentProfileFilesPagePC}
      Mobile={GovernmentProfileFilesPageMobile}
      viewProps={viewProps}
    />
  )
}
