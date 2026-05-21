import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import { useDocumentTitle } from '../../../../hooks/useDocumentTitle'
import { useAuth } from '../../../auth/AuthProvider'
import { useGovernmentAccess } from '../../hooks/useGovernmentAccess'
import { useGovernmentWorkspaceState } from '../../hooks/useGovernmentWorkspaceState'
import {
  governmentProfileWorkspacePath,
  parseGovernmentProfileWorkspaceTab,
} from '../../config/governmentProfileWorkspaceTabs'
import GovernmentProfileListPanel from './GovernmentProfileListPanel'
import GovernmentProfileWorkspaceLayoutPC from './GovernmentProfileWorkspaceLayoutPC'
import GovernmentProfileWorkspaceLayoutMobile from './GovernmentProfileWorkspaceLayoutMobile'
import {
  GovernmentProfileWorkspaceContext,
  type GovernmentProfileWorkspaceContextValue,
} from './governmentProfileWorkspaceContext'
import type { GovernmentProfileWorkspaceLayoutViewProps } from './governmentProfileWorkspaceViewProps'
import type { GovernmentProfileWorkspaceTab } from '../../config/governmentProfileWorkspaceTabs'

function parseProfileIdFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/government\/my-applications\/([^/]+)/)
  if (!m?.[1]) {
    return null
  }
  try {
    return decodeURIComponent(m[1])
  } catch {
    return m[1]
  }
}

function resolveActiveTab(pathname: string): GovernmentProfileWorkspaceTab | null {
  const m = pathname.match(/^\/government\/my-applications\/[^/]+\/([^/]+)/)
  if (!m?.[1]) {
    return null
  }
  return parseGovernmentProfileWorkspaceTab(m[1])
}

export default function GovernmentProfileWorkspaceLayout() {
  useDocumentTitle('정부지원 CRM · 내 고객/신청')
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = useAuth()
  const { summary, reload: reloadAccess } = useGovernmentAccess(token)

  const defaultTenantId = useMemo(() => {
    if (!summary) return null
    if (summary.defaultWorkspaceTenantId) return summary.defaultWorkspaceTenantId
    if (summary.workspaceTenantIds.length > 0) return summary.workspaceTenantIds[0]
    return summary.governmentProgramUserTenantIds[0] ?? null
  }, [summary])

  const ws = useGovernmentWorkspaceState(token, defaultTenantId, {
    canCreateProfile: true,
    onProfilesChanged: () => void reloadAccess(),
  })

  const selectedProfileIdFromPath = useMemo(
    () => parseProfileIdFromPath(location.pathname),
    [location.pathname],
  )

  const activeTab = useMemo(() => resolveActiveTab(location.pathname), [location.pathname])

  const { selectedId, setSelectedId, ...wsRest } = ws

  useEffect(() => {
    if (selectedProfileIdFromPath && selectedProfileIdFromPath !== selectedId) {
      setSelectedId(selectedProfileIdFromPath)
    }
  }, [selectedProfileIdFromPath, selectedId, setSelectedId])

  const onSelectProfile = useCallback(
    (profileId: string) => {
      const tab = activeTab ?? 'files'
      navigate(governmentProfileWorkspacePath(profileId, tab), { replace: true })
    },
    [activeTab, navigate],
  )

  const selectedProfile = useMemo(() => {
    if (selectedProfileIdFromPath) {
      return ws.profiles.find((p) => p.id === selectedProfileIdFromPath) ?? ws.selected
    }
    return ws.selected
  }, [selectedProfileIdFromPath, ws.profiles, ws.selected])

  const selectedProfileLabel = useMemo(() => {
    if (selectedProfile?.businessName?.trim()) {
      return selectedProfile.businessName.trim()
    }
    if (selectedProfile?.customerName?.trim()) {
      return selectedProfile.customerName.trim()
    }
    return selectedProfileIdFromPath ? '선택 사업장' : ''
  }, [selectedProfile, selectedProfileIdFromPath])

  const moveToTab = useCallback(
    (tab: GovernmentProfileWorkspaceTab) => {
      if (!selectedProfileIdFromPath) {
        return
      }
      navigate(governmentProfileWorkspacePath(selectedProfileIdFromPath, tab), { replace: true })
    },
    [navigate, selectedProfileIdFromPath],
  )

  const contextValue = useMemo<GovernmentProfileWorkspaceContextValue>(
    () => ({
      ...wsRest,
      selectedId,
      setSelectedId,
      selectedProfileIdFromPath,
      onSelectProfile,
    }),
    [wsRest, selectedId, setSelectedId, selectedProfileIdFromPath, onSelectProfile],
  )

  const viewProps: GovernmentProfileWorkspaceLayoutViewProps = {
    pathname: location.pathname,
    selectedProfileId: selectedProfileIdFromPath,
    selectedProfile: selectedProfile ?? null,
    selectedProfileLabel,
    activeTab,
    onClickFiles: () => moveToTab('files'),
    onClickConsultations: () => moveToTab('consultations'),
    onClickMemos: () => moveToTab('memos'),
    onClickProgress: () => moveToTab('progress'),
    onClickSignatures: () => moveToTab('signatures'),
  }

  return (
    <GovernmentProfileWorkspaceContext.Provider value={contextValue}>
      <div className="customer-workspace-layout">
        <aside className="customer-workspace-layout__left" aria-label="사업장 작업공간">
          <GovernmentProfileListPanel />
        </aside>
        <ResponsiveLayout<GovernmentProfileWorkspaceLayoutViewProps>
          PC={GovernmentProfileWorkspaceLayoutPC}
          Mobile={GovernmentProfileWorkspaceLayoutMobile}
          viewProps={viewProps}
        />
      </div>
    </GovernmentProfileWorkspaceContext.Provider>
  )
}
