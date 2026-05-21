import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { fetchGaCustomerExcelCapability, type GaCustomerExcelCapability } from '../customers/api/gaCustomerExcelApi'
import {
  DEFAULT_GA_SETTINGS,
  GaSettingsContext,
  type GaSettings,
  type GaSettingsContextValue,
} from './GaSettingsContext'

function toGaSettings(capability: GaCustomerExcelCapability | null): GaSettings {
  if (!capability) {
    return DEFAULT_GA_SETTINGS
  }
  return {
    use_ga_excel: capability.featureEnabled,
    config_ready: capability.configReady,
    show_designer_ui: capability.showDesignerUi,
    message: capability.message ?? '',
  }
}

export function GaSettingsProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth()
  const [gaSettings, setGaSettings] = useState<GaSettings>(DEFAULT_GA_SETTINGS)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!isAuthenticated || !token?.trim()) {
      setGaSettings(DEFAULT_GA_SETTINGS)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const capability = await fetchGaCustomerExcelCapability(token)
      setGaSettings(toGaSettings(capability))
    } catch {
      setGaSettings(DEFAULT_GA_SETTINGS)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, token])

  useEffect(() => {
    if (!isAuthenticated || !token?.trim()) {
      queueMicrotask(() => {
        setGaSettings(DEFAULT_GA_SETTINGS)
        setLoading(false)
      })
      return
    }
    void refresh()
  }, [isAuthenticated, refresh, token])

  const value = useMemo<GaSettingsContextValue>(
    () => ({ gaSettings, loading, refresh }),
    [gaSettings, loading, refresh],
  )

  return <GaSettingsContext.Provider value={value}>{children}</GaSettingsContext.Provider>
}
