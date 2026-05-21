import type { GovSupportProfile } from '../../types/governmentProfile.types'
import type { GovernmentProfileWorkspaceTab } from '../../config/governmentProfileWorkspaceTabs'

export type GovernmentProfileWorkspaceLayoutViewProps = {
  pathname: string
  selectedProfileId: string | null
  selectedProfile: GovSupportProfile | null
  selectedProfileLabel: string
  activeTab: GovernmentProfileWorkspaceTab | null
  onClickFiles: () => void
  onClickConsultations: () => void
  onClickMemos: () => void
  onClickProgress: () => void
  onClickSignatures: () => void
}
