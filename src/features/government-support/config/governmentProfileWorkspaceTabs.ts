/** URL path tab → useGovernmentWorkspaceState 내부 탭 */
export type GovernmentProfileWorkspaceTab =
  | 'files'
  | 'consultations'
  | 'memos'
  | 'progress'
  | 'signatures'

export const GOVERNMENT_PROFILE_WORKSPACE_TABS: { id: GovernmentProfileWorkspaceTab; label: string }[] = [
  { id: 'files', label: '서류/파일' },
  { id: 'consultations', label: '상담 이력' },
  { id: 'memos', label: '메모' },
  { id: 'progress', label: '진행상황' },
  { id: 'signatures', label: '전자서명' },
]

export function parseGovernmentProfileWorkspaceTab(raw: string | undefined): GovernmentProfileWorkspaceTab {
  const t = String(raw ?? '').trim().toLowerCase()
  if (GOVERNMENT_PROFILE_WORKSPACE_TABS.some((x) => x.id === t)) {
    return t as GovernmentProfileWorkspaceTab
  }
  return 'files'
}

export function governmentProfileWorkspacePath(profileId: string, tab: GovernmentProfileWorkspaceTab): string {
  return `/government/my-applications/${encodeURIComponent(profileId)}/${tab}`
}
