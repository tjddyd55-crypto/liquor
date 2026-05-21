import type { CustomerWorkspaceTab } from './customerWorkspaceNavigation'

/** 고객 목록 루트 경로 */
export const CUSTOMER_LIST_PATH = '/customers'

/** 고객 등록 모드 query */
export const CUSTOMER_CREATE_MODE_QUERY = { mode: 'create' } as const

export function buildCustomerWorkspacePath(params: {
  customerId: number
  tab: CustomerWorkspaceTab
  query?: URLSearchParams
}): string {
  const qs = params.query?.toString() ?? ''
  const base = `${CUSTOMER_LIST_PATH}/${params.customerId}/${params.tab}`
  return qs ? `${base}?${qs}` : base
}

export function buildCustomerListPath(query?: URLSearchParams): string {
  const qs = query?.toString() ?? ''
  return qs ? `${CUSTOMER_LIST_PATH}?${qs}` : CUSTOMER_LIST_PATH
}
