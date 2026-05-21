import { createContext, useContext } from 'react'
import type { useGovernmentWorkspaceState } from '../../hooks/useGovernmentWorkspaceState'

export type GovernmentProfileWorkspaceContextValue = ReturnType<typeof useGovernmentWorkspaceState> & {
  selectedProfileIdFromPath: string | null
  onSelectProfile: (profileId: string) => void
}

export const GovernmentProfileWorkspaceContext = createContext<GovernmentProfileWorkspaceContextValue | null>(
  null,
)

export function useGovernmentProfileWorkspaceContext(): GovernmentProfileWorkspaceContextValue {
  const ctx = useContext(GovernmentProfileWorkspaceContext)
  if (!ctx) {
    throw new Error('useGovernmentProfileWorkspaceContext must be used within GovernmentProfileWorkspaceLayout')
  }
  return ctx
}
