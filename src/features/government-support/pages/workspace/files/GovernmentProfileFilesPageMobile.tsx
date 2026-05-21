import GovernmentProfileFilesPagePC from './GovernmentProfileFilesPagePC'
import type { GovernmentProfileFilesViewProps } from './governmentProfileFilesViewProps'

export default function GovernmentProfileFilesPageMobile(props: GovernmentProfileFilesViewProps) {
  return <GovernmentProfileFilesPagePC {...props} variant="mobile" />
}
