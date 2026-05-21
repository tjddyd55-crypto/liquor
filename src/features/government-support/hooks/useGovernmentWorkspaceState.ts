import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createGovApplicationCase,
  createGovPriorLoan,
  createGovProfile,
  patchGovPriorLoan,
  deleteGovPriorLoan,
  fetchGovApplicationCases,
  fetchGovPriorLoans,
  fetchGovProfiles,
  patchGovApplicationCase,
  patchGovProfile,
} from '../api/governmentProfilesApi'
import type { GovApplicationCase, GovPriorLoan, GovSupportProfile } from '../types/governmentProfile.types'

export type GovernmentWorkspaceTab =
  | 'reception'
  | 'customer'
  | 'business'
  | 'funding'
  | 'loans'
  | 'application'
  | 'edoc'
  | 'documents'
  | 'schedule'
  | 'memo'

export function useGovernmentWorkspaceState(
  token: string | null,
  defaultTenantId: string | null,
  options?: { canCreateProfile?: boolean; onProfilesChanged?: () => void },
) {
  const canCreateProfile = options?.canCreateProfile ?? true
  const onProfilesChanged = options?.onProfilesChanged
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [profiles, setProfiles] = useState<GovSupportProfile[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [tab, setTab] = useState<GovernmentWorkspaceTab>('reception')
  const [priorLoans, setPriorLoans] = useState<GovPriorLoan[]>([])
  const [cases, setCases] = useState<GovApplicationCase[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  )

  const reloadProfiles = useCallback(async () => {
    if (!token) return
    const rows = await fetchGovProfiles(token)
    setProfiles(rows)
    if (rows.length > 0 && !selectedId) {
      setSelectedId(rows[0].id)
    }
  }, [token, selectedId])

  const reloadDetail = useCallback(async () => {
    if (!token || !selectedId) {
      setPriorLoans([])
      setCases([])
      return
    }
    const [loans, appCases] = await Promise.all([
      fetchGovPriorLoans(token, selectedId),
      fetchGovApplicationCases(token, selectedId),
    ])
    setPriorLoans(loans)
    setCases(appCases)
  }, [token, selectedId])

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    void reloadProfiles()
      .catch((e) => setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [token, reloadProfiles])

  useEffect(() => {
    void reloadDetail()
  }, [reloadDetail])

  const saveProfile = useCallback(
    async (patch: Partial<GovSupportProfile>) => {
      if (!token || !selected) return
      const next = await patchGovProfile(token, selected.id, patch)
      setProfiles((prev) => prev.map((p) => (p.id === next.id ? next : p)))
      setFeedback('저장했습니다.')
    },
    [token, selected],
  )

  const addProfile = useCallback(async () => {
    if (!token) {
      return
    }
    if (!canCreateProfile) {
      setError('고객/사업장을 등록할 권한이 없습니다.')
      return
    }
    setError(null)
    try {
      const row = await createGovProfile(token, defaultTenantId)
      setProfiles((prev) => [row, ...prev])
      setSelectedId(row.id)
      setFeedback('사업장을 등록했습니다.')
      onProfilesChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '고객/사업장 등록에 실패했습니다.')
    }
  }, [token, defaultTenantId, canCreateProfile, onProfilesChanged])

  const addPriorLoan = useCallback(async () => {
    if (!token || !selectedId) return
    await createGovPriorLoan(token, selectedId, { hasPrior: 'Y', lenderName: '', remainingAmount: '' })
    await reloadDetail()
  }, [token, selectedId, reloadDetail])

  const updatePriorLoan = useCallback(
    async (loanId: string, patch: Partial<GovPriorLoan>) => {
      if (!token) return
      await patchGovPriorLoan(token, loanId, patch)
      await reloadDetail()
    },
    [token, reloadDetail],
  )

  const removePriorLoan = useCallback(
    async (loanId: string) => {
      if (!token) return
      await deleteGovPriorLoan(token, loanId)
      await reloadDetail()
    },
    [token, reloadDetail],
  )

  const addApplicationCase = useCallback(async () => {
    if (!token || !selected) return
    await createGovApplicationCase(token, selected.id, {
      productName: selected.productName,
      progressStatus: '상담 접수',
    })
    await reloadDetail()
    setFeedback('신청/청약 건을 추가했습니다.')
  }, [token, selected, reloadDetail])

  const updateCaseStatus = useCallback(
    async (caseId: string, progressStatus: string) => {
      if (!token) return
      await patchGovApplicationCase(token, caseId, { progressStatus })
      await reloadDetail()
      await reloadProfiles()
    },
    [token, reloadDetail, reloadProfiles],
  )

  const updateCaseField = useCallback(
    async (caseId: string, patch: Partial<GovApplicationCase>) => {
      if (!token) return
      await patchGovApplicationCase(token, caseId, patch)
      await reloadDetail()
      await reloadProfiles()
    },
    [token, reloadDetail, reloadProfiles],
  )

  return {
    loading,
    error,
    profiles,
    selected,
    selectedId,
    setSelectedId,
    tab,
    setTab,
    priorLoans,
    cases,
    feedback,
    setFeedback,
    saveProfile,
    addProfile,
    addPriorLoan,
    updatePriorLoan,
    removePriorLoan,
    addApplicationCase,
    updateCaseStatus,
    updateCaseField,
    reloadProfiles,
  }
}
