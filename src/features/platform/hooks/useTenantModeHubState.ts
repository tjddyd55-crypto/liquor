import { useCallback, useEffect, useMemo, useState } from 'react'

import { listGaCompanies, type GaCompanyRow } from '../../auth/authApi'
import { ApiError } from '../../../lib/apiClient'
import { fetchPlatformTenants } from '../api/platformAdminApi'
import type { PlatformTenantRow } from '../platformAdmin.types'
import type { PlatformLandingDecision } from './usePlatformLandingAccess'

export type LegacyGaLinkStatus =
  | 'connected'
  | 'needs_ga'
  | 'ga_not_found'
  | 'session_ga_only'
  | 'no_session_ga'
  | 'unknown'

export type UseTenantModeHubStateArgs = {
  token: string | null | undefined
  tenantIdParam: string
  decision: PlatformLandingDecision
  isSuperAdmin: boolean
  userGaId: number | null | undefined
}

export type TenantModeHubState = {
  loading: boolean
  error: string | null
  tenantRow: PlatformTenantRow | null
  tenantNotFound: boolean
  tenantMetaRestricted: boolean
  gaRow: GaCompanyRow | null
  legacyGaLinkStatus: LegacyGaLinkStatus
  gaIdForAdminLink: number | null
  reload: () => Promise<void>
}

function messageFromUnknown(err: unknown): string {
  return err instanceof ApiError ? err.message : '정보를 불러오지 못했습니다.'
}

export function useTenantModeHubState(args: UseTenantModeHubStateArgs): TenantModeHubState {
  const token = typeof args.token === 'string' && args.token.trim() !== '' ? args.token.trim() : null
  const tenantKey = String(args.tenantIdParam ?? '').trim()
  const allowFetch = Boolean(token) && args.decision === 'allowed' && tenantKey !== ''

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tenantRow, setTenantRow] = useState<PlatformTenantRow | null>(null)
  const [tenantNotFound, setTenantNotFound] = useState(false)
  const [tenantMetaRestricted, setTenantMetaRestricted] = useState(false)
  const [gaRow, setGaRow] = useState<GaCompanyRow | null>(null)
  const [legacyGaLinkStatus, setLegacyGaLinkStatus] = useState<LegacyGaLinkStatus>('unknown')

  const reload = useCallback(async () => {
    if (!allowFetch || !token) {
      setLoading(false)
      setError(null)
      setTenantRow(null)
      setTenantNotFound(false)
      setTenantMetaRestricted(false)
      setGaRow(null)
      setLegacyGaLinkStatus('unknown')
      return
    }

    setLoading(true)
    setError(null)
    setTenantNotFound(false)

    try {
      if (args.isSuperAdmin) {
        setTenantMetaRestricted(false)
        const res = await fetchPlatformTenants(token)
        const match = res.items.find((t) => String(t.id).trim() === tenantKey)
        if (!match) {
          setTenantRow(null)
          setTenantNotFound(true)
          setGaRow(null)
          setLegacyGaLinkStatus('unknown')
          return
        }
        setTenantRow(match)

        const legacyId = match.legacyGaId
        if (legacyId == null || legacyId < 1) {
          setGaRow(null)
          setLegacyGaLinkStatus('needs_ga')
          return
        }

        const gas = await listGaCompanies(token)
        const gaHit = gas.find((g) => g.id === legacyId) ?? null
        setGaRow(gaHit)
        if (gaHit) {
          setLegacyGaLinkStatus('connected')
        } else {
          setLegacyGaLinkStatus('ga_not_found')
        }
        return
      }

      setTenantMetaRestricted(true)
      setTenantRow(null)
      setTenantNotFound(false)

      const sessionGa =
        typeof args.userGaId === 'number' && Number.isInteger(args.userGaId) && args.userGaId > 0
          ? args.userGaId
          : null

      const gas = await listGaCompanies(token)
      if (sessionGa != null) {
        const gaHit = gas.find((g) => g.id === sessionGa) ?? null
        setGaRow(gaHit)
        setLegacyGaLinkStatus(gaHit ? 'session_ga_only' : 'no_session_ga')
      } else {
        setGaRow(null)
        setLegacyGaLinkStatus('no_session_ga')
      }
    } catch (e) {
      setError(messageFromUnknown(e))
      setTenantRow(null)
      setTenantNotFound(false)
      setGaRow(null)
      setLegacyGaLinkStatus('unknown')
    } finally {
      setLoading(false)
    }
  }, [allowFetch, args.isSuperAdmin, args.userGaId, tenantKey, token])

  useEffect(() => {
    void reload()
  }, [reload])

  const gaIdForAdminLink = useMemo((): number | null => {
    if (args.isSuperAdmin && tenantRow) {
      const lid = tenantRow.legacyGaId
      if (lid != null && Number.isInteger(lid) && lid > 0) {
        return lid
      }
      return null
    }
    if (!args.isSuperAdmin) {
      const sessionGa =
        typeof args.userGaId === 'number' && Number.isInteger(args.userGaId) && args.userGaId > 0
          ? args.userGaId
          : null
      return sessionGa
    }
    return null
  }, [args.isSuperAdmin, args.userGaId, tenantRow])

  return {
    loading,
    error,
    tenantRow,
    tenantNotFound,
    tenantMetaRestricted,
    gaRow,
    legacyGaLinkStatus,
    gaIdForAdminLink,
    reload,
  }
}
