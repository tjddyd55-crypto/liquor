import { createContext } from 'react'

export type GaSettings = {
  use_ga_excel: boolean
  config_ready: boolean
  show_designer_ui: boolean
  message: string
}

export type GaSettingsContextValue = {
  gaSettings: GaSettings
  loading: boolean
  refresh: () => Promise<void>
}

export const DEFAULT_GA_SETTINGS: GaSettings = {
  use_ga_excel: false,
  config_ready: false,
  show_designer_ui: false,
  message: '',
}

export const GA_SETTINGS_CONTEXT_DEFAULT: GaSettingsContextValue = {
  gaSettings: DEFAULT_GA_SETTINGS,
  loading: false,
  refresh: async () => {
    return
  },
}

export const GaSettingsContext = createContext<GaSettingsContextValue>(GA_SETTINGS_CONTEXT_DEFAULT)
