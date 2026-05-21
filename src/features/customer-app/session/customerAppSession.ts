const CUSTOMER_APP_SESSION_KEY = 'insurance.customer-app.session'
const CUSTOMER_APP_PROFILE_KEY = 'insurance.customer-app.profile'

export interface CustomerAppSession {
  appToken: string
  agentId: string
  customerId: number
  deviceId: string
  agentName: string
  customerName: string
  linkCode?: string
  requesterName?: string
  requesterBirthDate?: string
  requesterPhone?: string
}

export function readCustomerAppSession(): CustomerAppSession | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_APP_SESSION_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as CustomerAppSession
    if (!parsed?.appToken || !parsed?.agentId || !parsed?.customerId || !parsed?.deviceId) {
      return null
    }
    return {
      appToken: String(parsed.appToken),
      agentId: String(parsed.agentId),
      customerId: Number(parsed.customerId),
      deviceId: String(parsed.deviceId),
      agentName: String(parsed.agentName ?? ''),
      customerName: String(parsed.customerName ?? ''),
      linkCode: String(parsed.linkCode ?? '').trim() || undefined,
      requesterName: String(parsed.requesterName ?? '').trim() || undefined,
      requesterBirthDate: String(parsed.requesterBirthDate ?? '').trim() || undefined,
      requesterPhone: String(parsed.requesterPhone ?? '').trim() || undefined,
    }
  } catch {
    return null
  }
}

export function writeCustomerAppSession(session: CustomerAppSession): void {
  window.localStorage.setItem(CUSTOMER_APP_SESSION_KEY, JSON.stringify(session))
}

export function clearCustomerAppSession(): void {
  window.localStorage.removeItem(CUSTOMER_APP_SESSION_KEY)
}

export interface CustomerAppProfile {
  name: string
  birthDate: string
  phone: string
  savedAt: string | null
}

export function readCustomerAppProfile(): CustomerAppProfile | null {
  try {
    const raw = window.localStorage.getItem(CUSTOMER_APP_PROFILE_KEY)
    if (!raw) {
      return null
    }
    const parsed = JSON.parse(raw) as CustomerAppProfile
    const name = String(parsed?.name ?? '').trim()
    const birthDate = String(parsed?.birthDate ?? '').trim()
    const phone = String(parsed?.phone ?? '').trim()
    if (!name || !birthDate || !phone) {
      return null
    }
    return {
      name,
      birthDate,
      phone,
      savedAt: parsed?.savedAt ? String(parsed.savedAt) : null,
    }
  } catch {
    return null
  }
}

export function writeCustomerAppProfile(profile: {
  name: string
  birthDate: string
  phone: string
}): void {
  const payload: CustomerAppProfile = {
    name: String(profile.name ?? '').trim(),
    birthDate: String(profile.birthDate ?? '').trim(),
    phone: String(profile.phone ?? '').trim(),
    savedAt: new Date().toISOString(),
  }
  window.localStorage.setItem(CUSTOMER_APP_PROFILE_KEY, JSON.stringify(payload))
}

export function resolveCustomerDeviceId(): string {
  const key = 'insurance.customer-app.device-id'
  const existing = window.localStorage.getItem(key)
  if (existing && existing.trim()) {
    return existing
  }
  const created =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
  window.localStorage.setItem(key, created)
  return created
}
