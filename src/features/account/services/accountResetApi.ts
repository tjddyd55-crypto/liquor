import { apiRequest } from '../../../lib/apiClient'

export async function requestAccountResetCode(
  token: string,
  body: { phoneNumber: string },
): Promise<{ ok: boolean; message?: string; debugCode?: string; retryAfterSec?: number }> {
  return apiRequest('/api/account/request-reset-account-code', {
    method: 'POST',
    token,
    body: JSON.stringify({
      phoneNumber: body.phoneNumber,
    }),
  })
}

export async function resetAccountBySms(
  token: string,
  body: { phoneNumber: string; code: string; confirmReset: boolean },
): Promise<{ ok: boolean; message?: string }> {
  return apiRequest('/api/account/reset-account-by-sms', {
    method: 'POST',
    token,
    body: JSON.stringify({
      phoneNumber: body.phoneNumber,
      code: body.code.trim(),
      confirmReset: body.confirmReset,
    }),
  })
}
