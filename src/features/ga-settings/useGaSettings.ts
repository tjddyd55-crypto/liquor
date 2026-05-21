import { useContext } from 'react'
import { GaSettingsContext, type GaSettingsContextValue } from './GaSettingsContext'

export function useGaSettings(): GaSettingsContextValue {
  return useContext(GaSettingsContext)
}
