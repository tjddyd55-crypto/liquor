import { useParams } from 'react-router-dom'
import { parseGovernmentProfileWorkspaceTab } from '../../config/governmentProfileWorkspaceTabs'
import GovernmentProfileDetailPanels from './GovernmentProfileDetailPanels'

export default function GovernmentProfileWorkspaceTabPage() {
  const { tab: rawTab } = useParams<{ profileId: string; tab: string }>()
  const tab = parseGovernmentProfileWorkspaceTab(rawTab)
  return <GovernmentProfileDetailPanels tab={tab} />
}
