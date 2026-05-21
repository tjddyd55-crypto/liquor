import Constants from 'expo-constants'
import semver from 'semver'

const DEFAULT_VERSION_URL = 'https://insurance-production-7bd8.up.railway.app/api/version'

export function getVersionCheckUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_VERSION_API_URL?.trim()
  return fromEnv || DEFAULT_VERSION_URL
}

export type VersionPolicyResponse = {
  latestVersion?: string
  minVersion?: string
  forceUpdate?: boolean
  disableOTA?: boolean
  serverTime?: number
  message?: string
}

export type ClientVersionPolicy = {
  /** Server says current build is below minVersion — block normal use until update. */
  forceUpdateActive: boolean
  /** Emergency: skip Expo OTA fetch/reload entirely when true. */
  disableOTA: boolean
  /** Operator-facing banner from APP_MESSAGE. */
  message: string
}

export async function fetchClientVersionPolicy(): Promise<ClientVersionPolicy> {
  try {
    const res = await fetch(getVersionCheckUrl(), {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      return { forceUpdateActive: false, disableOTA: false, message: '' }
    }
    const data = (await res.json()) as VersionPolicyResponse
    const disableOTA = Boolean(data.disableOTA)
    const message = typeof data.message === 'string' ? data.message.trim() : ''
    const current = Constants.expoConfig?.version ?? '0.0.0'
    const forceUpdateActive = Boolean(
      data.forceUpdate &&
        typeof data.minVersion === 'string' &&
        semver.valid(current) &&
        semver.valid(data.minVersion) &&
        semver.lt(current, data.minVersion),
    )
    return { forceUpdateActive, disableOTA, message }
  } catch {
    return { forceUpdateActive: false, disableOTA: false, message: '' }
  }
}
