import { useMemo } from 'react'

import { usePlatformAccess } from './usePlatformAccess'
import type { PlatformAccessSummary } from '../platformAdmin.types'

export type PlatformLandingScopeType = 'industry' | 'tenant'

export type PlatformLandingDecision = 'loading' | 'allowed' | 'denied' | 'error'

function normalizeScopeId(scopeId: string | undefined): string {
  return String(scopeId ?? '').trim()
}

function listIncludesNormalized(ids: readonly string[] | undefined, needle: string): boolean {
  const n = needle.trim()
  if (!n) return false
  if (!ids || ids.length === 0) return false
  return ids.some((x) => String(x).trim() === n)
}

export type UsePlatformLandingAccessArgs = {
  token: string | null | undefined
  scopeType: PlatformLandingScopeType
  scopeId: string | undefined
}

export type UsePlatformLandingAccessResult = {
  loading: boolean
  error: unknown
  summary: PlatformAccessSummary | null
  decision: PlatformLandingDecision
  reload: () => Promise<void>
}

/**
 * `/admin/industry` · `/admin/tenant` placeholder 접근 판별.
 * 향후 ProtectedRoute 이동 시에도 동일 규칙을 재사용할 수 있도록 summary 기반만 사용한다.
 */
export function usePlatformLandingAccess(
  args: UsePlatformLandingAccessArgs,
): UsePlatformLandingAccessResult {
  const scopeNorm = useMemo(() => normalizeScopeId(args.scopeId), [args.scopeId])
  const trimmedToken = typeof args.token === 'string' ? args.token.trim() : ''

  const { loading, error, summary, reload } = usePlatformAccess(trimmedToken || null)

  const decision = useMemo((): PlatformLandingDecision => {
    if (!scopeNorm) {
      return 'denied'
    }
    if (!trimmedToken) {
      return 'denied'
    }
    if (error) {
      return 'error'
    }
    if (!summary) {
      return 'loading'
    }
    if (summary.isSuperAdmin === true) {
      return 'allowed'
    }
    if (args.scopeType === 'industry') {
      return listIncludesNormalized(summary.industryAdminIndustryIds, scopeNorm) ? 'allowed' : 'denied'
    }
    return listIncludesNormalized(summary.tenantAdminTenantIds, scopeNorm) ? 'allowed' : 'denied'
  }, [args.scopeType, error, scopeNorm, summary, trimmedToken])

  return {
    loading,
    error,
    summary,
    decision,
    reload,
  }
}
