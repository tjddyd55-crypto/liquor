import type { CustomerRecord } from '../domain/types'
import { getCustomerListMetrics } from './customerListMetrics'

export type CustomerAdvancedFilters = {
  minInsuranceAge: string
  maxInsuranceAge: string
  gender: '' | 'male' | 'female'
}

export const EMPTY_ADVANCED_FILTERS: CustomerAdvancedFilters = {
  minInsuranceAge: '',
  maxInsuranceAge: '',
  gender: '',
}

function parseOptionalInt(s: string): number | null {
  const t = s.trim()
  if (!t) {
    return null
  }
  const n = Number.parseInt(t, 10)
  return Number.isFinite(n) ? n : null
}

export function customerRenewalYmd(c: CustomerRecord): string | null {
  const raw = (c.renewalDate ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null
}

export function customerPassesAdvancedFilters(c: CustomerRecord, filters: CustomerAdvancedFilters): boolean {
  const metrics = getCustomerListMetrics(c)

  if (filters.gender === 'male' || filters.gender === 'female') {
    if (c.gender !== filters.gender) {
      return false
    }
  }

  const minA = parseOptionalInt(filters.minInsuranceAge)
  if (minA != null) {
    if (metrics.insuranceAge == null || metrics.insuranceAge < minA) {
      return false
    }
  }

  const maxA = parseOptionalInt(filters.maxInsuranceAge)
  if (maxA != null) {
    if (metrics.insuranceAge == null || metrics.insuranceAge > maxA) {
      return false
    }
  }

  return true
}

export function ymdAscSortKey(ymd: string | null): string {
  return ymd ?? '9999-12-31'
}

export function parseCreatedAtMs(iso: string | undefined | null): number {
  const t = Date.parse(String(iso ?? ''))
  return Number.isFinite(t) ? t : 0
}

export function normalizeYmd(value: string | null | undefined): string | null {
  const s = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return null
  }
  return s
}

export function parseYmdMs(ymd: string | null | undefined): number {
  const valid = normalizeYmd(ymd)
  if (!valid) {
    return 0
  }
  const t = Date.parse(`${valid}T00:00:00.000Z`)
  return Number.isFinite(t) ? t : 0
}
