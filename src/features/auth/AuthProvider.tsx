/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AuthUser, UserRole } from './authApi'
import {
  normalizeSubscriptionFromApi,
  type SubscriptionSnapshot,
} from '../subscription/policy'
import type { TenantCrmConfig } from '../customer-templates/customerTemplate.types'

interface AuthSession {
  token: string
  user: AuthUser
}

interface AuthContextValue {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
  login: (session: AuthSession) => void
  logout: () => void
}

const AUTH_STORAGE_KEY = 'insurance.auth.session'

const VALID_CANONICAL: UserRole[] = ['SUPER_ADMIN', 'GA_ADMIN', 'GA_STAFF', 'USER', 'INSURER_MANAGER', 'LOSS_ADJUSTER']

const LEGACY_TO_ROLE: Record<string, UserRole> = {
  super_admin: 'SUPER_ADMIN',
  staff: 'GA_ADMIN',
  user: 'USER',
}

function normalizeRole(value: unknown): UserRole | null {
  if (typeof value !== 'string') {
    return null
  }
  const t = value.trim()
  if (VALID_CANONICAL.includes(t as UserRole)) {
    return t as UserRole
  }
  return LEGACY_TO_ROLE[t] ?? null
}

const AuthContext = createContext<AuthContextValue | null>(null)

function parseGaId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0) {
      return n
    }
  }
  return null
}

function parseCompanyScopeId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0) {
      return n
    }
  }
  return null
}

function parseStoredTenantCrm(raw: unknown): TenantCrmConfig | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  return raw as TenantCrmConfig
}

function parseTeamIdField(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }
  return null
}

function readStoredSession(): AuthSession | null {
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as AuthSession
    if (!parsed?.token || !parsed?.user?.id) {
      return null
    }

    const role = normalizeRole(parsed.user.role)
    if (role == null) {
      console.warn('role 없음 → 재로그인 필요')
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    const gaId = parseGaId((parsed.user as { gaId?: unknown }).gaId)
    if (gaId == null) {
      console.warn('gaId 없음 → 재로그인 필요')
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    const u = parsed.user as {
      gaCode?: unknown
      gaName?: unknown
      companyId?: unknown
      displayName?: unknown
      teamId?: unknown
      subscription?: unknown
      crmIndustryCode?: unknown
      tenantCrm?: unknown
      crmDynamicIndustryTemplate?: unknown
    }
    const gaCode = typeof u.gaCode === 'string' ? u.gaCode.trim().toUpperCase() : ''
    const gaName = typeof u.gaName === 'string' ? u.gaName.trim() : ''
    const companyIdRaw = parseCompanyScopeId(u.companyId)
    const displayNameRaw =
      typeof u.displayName === 'string' ? u.displayName.trim() : String(parsed.user.username ?? '').trim()
    const teamId = parseTeamIdField(u.teamId)

    if (role === 'INSURER_MANAGER' && companyIdRaw == null) {
      console.warn(`${role} companyId 없음 → 재로그인 필요`)
      window.localStorage.removeItem(AUTH_STORAGE_KEY)
      return null
    }

    const crmRaw = u.crmIndustryCode
    const crmIndustryCode =
      crmRaw == null ? undefined : typeof crmRaw === 'string' && crmRaw.trim() ? crmRaw.trim() : String(crmRaw).trim()

    return {
      token: parsed.token,
      user: {
        id: String(parsed.user.id),
        username: String(parsed.user.username ?? ''),
        role,
        gaId,
        gaCode,
        gaName,
        companyId: role === 'INSURER_MANAGER' ? companyIdRaw : null,
        displayName: displayNameRaw,
        teamId,
        subscription: normalizeSubscriptionFromApi(u.subscription),
        ...(crmIndustryCode ? { crmIndustryCode } : {}),
        tenantCrm: parseStoredTenantCrm(u.tenantCrm),
        ...(u.crmDynamicIndustryTemplate !== undefined && u.crmDynamicIndustryTemplate !== null
          ? { crmDynamicIndustryTemplate: u.crmDynamicIndustryTemplate }
          : {}),
      },
    }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession())

  const logout = useCallback(() => {
    setSession(null)
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  }, [])

  const login = useCallback(
    (nextSession: AuthSession) => {
      const role = normalizeRole(nextSession.user?.role)
      if (role == null) {
        console.warn('role 없음 → 재로그인 필요')
        logout()
        return
      }
      const gaId = parseGaId(nextSession.user?.gaId)
      if (role !== 'SUPER_ADMIN' && gaId == null) {
        console.warn('gaId 없음')
        logout()
        return
      }
      if (role === 'SUPER_ADMIN' && gaId == null) {
        console.warn('SUPER_ADMIN gaId 없음')
        logout()
        return
      }
      const gaCode =
        typeof nextSession.user.gaCode === 'string' ? nextSession.user.gaCode.trim().toUpperCase() : ''
      const gaName =
        typeof nextSession.user.gaName === 'string' ? nextSession.user.gaName.trim() : ''
      const companyId = role === 'INSURER_MANAGER' ? parseCompanyScopeId(nextSession.user.companyId) : null
      if (role === 'INSURER_MANAGER' && companyId == null) {
        console.warn(`${role} companyId 없음`)
        logout()
        return
      }
      const displayName =
        typeof nextSession.user.displayName === 'string' && nextSession.user.displayName.trim()
          ? nextSession.user.displayName.trim()
          : String(nextSession.user.username ?? '').trim()
      const teamId = parseTeamIdField(nextSession.user.teamId)
      const subscription = normalizeSubscriptionFromApi(nextSession.user.subscription)

      const normalized: AuthSession = {
        token: nextSession.token,
        user: {
          id: String(nextSession.user.id),
          username: String(nextSession.user.username ?? ''),
          role,
          gaId: gaId as number,
          gaCode,
          gaName,
          companyId,
          displayName,
          teamId,
          subscription,
      crmIndustryCode: nextSession.user.crmIndustryCode ?? undefined,
      tenantCrm: nextSession.user.tenantCrm ?? null,
      crmDynamicIndustryTemplate: nextSession.user.crmDynamicIndustryTemplate,
        },
      }
      setSession(normalized)
      window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalized))
    },
    [logout],
  )

  useEffect(() => {
    if (!session?.user) {
      return
    }
    if (!session.user.role || session.user.gaId == null) {
      console.warn('세션 불완전 → 재로그인 필요')
      queueMicrotask(() => {
        logout()
      })
      return
    }
    if (session.user.role === 'INSURER_MANAGER' && (session.user.companyId == null || session.user.companyId < 1)) {
      console.warn('채널 담당자 세션에 companyId 없음 → 재로그인 필요')
      queueMicrotask(() => {
        logout()
      })
    }
  }, [session, logout])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      isAuthenticated: Boolean(session?.token),
      login,
      logout,
    }),
    [session, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
