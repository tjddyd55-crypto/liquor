import { apiRequest } from '../../../lib/apiClient'

export async function requestPasswordResetCode(body: {
  username: string
  phoneNumber: string
}): Promise<{ ok: boolean; message?: string; debugCode?: string; retryAfterSec?: number }> {
  return apiRequest('/api/auth/request-password-reset-code', {
    method: 'POST',
    body: JSON.stringify({
      username: body.username.trim(),
      phoneNumber: body.phoneNumber,
    }),
  })
}

export async function resetPasswordBySms(body: {
  username: string
  phoneNumber: string
  code: string
  newPassword: string
}): Promise<{ ok: boolean; message?: string }> {
  return apiRequest('/api/auth/reset-password-by-sms', {
    method: 'POST',
    body: JSON.stringify({
      username: body.username.trim(),
      phoneNumber: body.phoneNumber,
      code: body.code.trim(),
      newPassword: body.newPassword,
    }),
  })
}
