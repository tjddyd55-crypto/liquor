import GovernmentProfileStorageWorkspace from '../../../components/GovernmentProfileStorageWorkspace'
import type { GovernmentProfileFilesViewProps } from './governmentProfileFilesViewProps'

export default function GovernmentProfileFilesPagePC({ token, profileId, variant = 'pc' }: GovernmentProfileFilesViewProps) {
  return <GovernmentProfileStorageWorkspace token={token} profileId={profileId} variant={variant} />
}
