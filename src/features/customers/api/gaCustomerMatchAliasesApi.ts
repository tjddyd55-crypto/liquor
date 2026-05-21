import { ApiError, apiRequest } from '../../../lib/apiClient'

export type GaCustomerMatchAliasesResponse = {
  customerName: string
  aliases: string[]
}

export async function fetchGaCustomerMatchAliases(
  token: string,
  customerId: number,
): Promise<GaCustomerMatchAliasesResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  if (!Number.isFinite(customerId) || customerId < 1) {
    throw new ApiError('customerId가 올바르지 않습니다.', 400)
  }
  const q = new URLSearchParams({ customerId: String(customerId) })
  return apiRequest<GaCustomerMatchAliasesResponse>(`/api/ga-customer-match-aliases?${q}`, { token })
}

export async function saveGaCustomerMatchAliases(
  token: string,
  customerId: number,
  aliases: string[],
): Promise<GaCustomerMatchAliasesResponse & { ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  if (!Number.isFinite(customerId) || customerId < 1) {
    throw new ApiError('customerId가 올바르지 않습니다.', 400)
  }
  return apiRequest<GaCustomerMatchAliasesResponse & { ok: boolean }>('/api/ga-customer-match-aliases', {
    method: 'PUT',
    token,
    body: JSON.stringify({ customerId, aliases }),
  })
}
