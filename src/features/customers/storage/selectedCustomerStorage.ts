import type { CustomerRecord } from '../domain/types'

export const SELECTED_CUSTOMER_STORAGE_KEY = 'insurance.selectedCustomer'

export function storeSelectedCustomer(customer: CustomerRecord): void {
  window.localStorage.setItem(SELECTED_CUSTOMER_STORAGE_KEY, JSON.stringify(customer))
}

export function readSelectedCustomer(): CustomerRecord | null {
  try {
    const raw = window.localStorage.getItem(SELECTED_CUSTOMER_STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as CustomerRecord
  } catch {
    return null
  }
}

export function clearSelectedCustomer(): void {
  window.localStorage.removeItem(SELECTED_CUSTOMER_STORAGE_KEY)
}
