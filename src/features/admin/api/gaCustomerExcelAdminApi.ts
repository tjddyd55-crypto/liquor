import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'

export type GaExcelColumnDef = { id: string; header: string; index: number }

export type GaExcelMatchRule = { columnId: string; dbField: string }

export type GaCustomerExcelSettingsDto = {
  gaId: number
  featureEnabled: boolean
  configReady: boolean
  sampleOriginalFilename: string
  sampleUploadedAt: string | null
  sampleColumns: GaExcelColumnDef[]
  matchRules: GaExcelMatchRule[]
  displayColumnIds: string[]
  updatedAt: string | null
  settingsVersion: number
  matchRuleCount: number
  displayColumnCount: number
}

export async function fetchGaCustomerExcelSettings(
  token: string,
  gaId: number,
): Promise<GaCustomerExcelSettingsDto> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<GaCustomerExcelSettingsDto>(`/api/admin/ga/${gaId}/customer-excel/settings`, { token })
}

export async function uploadGaCustomerExcelSample(
  token: string,
  gaId: number,
  file: File,
): Promise<{ ok: boolean; sampleColumns: GaExcelColumnDef[]; settings: GaCustomerExcelSettingsDto }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(resolveApiUrl(`/api/admin/ga/${gaId}/customer-excel/sample`), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(text || '응답 파싱 실패', res.status)
  }
  if (!res.ok) {
    const msg = typeof (data as { message?: string })?.message === 'string' ? (data as { message: string }).message : '업로드에 실패했습니다.'
    throw new ApiError(msg, res.status)
  }
  return data as { ok: boolean; sampleColumns: GaExcelColumnDef[]; settings: GaCustomerExcelSettingsDto }
}

export async function saveGaCustomerExcelSettings(
  token: string,
  gaId: number,
  body: {
    featureEnabled: boolean
    matchRules: GaExcelMatchRule[]
  },
): Promise<{ ok: boolean; settings: GaCustomerExcelSettingsDto }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest(`/api/admin/ga/${gaId}/customer-excel/settings`, {
    method: 'PUT',
    token,
    body: JSON.stringify(body),
  })
}
