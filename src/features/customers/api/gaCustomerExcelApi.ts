import { ApiError, apiRequest, resolveApiUrl } from '../../../lib/apiClient'

const MSG_PARSE_FAIL = '\uC751\uB2F5 \uD30C\uC2F1 \uC2E4\uD328'

export type GaCustomerExcelCapability = {
  gaId: number | null
  featureEnabled: boolean
  configReady: boolean
  showDesignerUi: boolean
  message: string
}

export async function fetchGaCustomerExcelCapability(token: string): Promise<GaCustomerExcelCapability> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<GaCustomerExcelCapability>('/api/ga-customer-excel/capability', { token })
}

/** @deprecated GA 공용 업로드 API는 410. {@link uploadUserExcelData} 사용 */
export async function uploadGaCustomerExcelData(token: string, file: File): Promise<{ ok: boolean; rowCount: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(resolveApiUrl('/api/ga-customer-excel/upload'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(text || MSG_PARSE_FAIL, res.status)
  }
  if (!res.ok) {
    const msg =
      typeof (data as { message?: string })?.message === 'string'
        ? (data as { message: string }).message
        : '업로드에 실패했습니다.'
    throw new ApiError(msg, res.status)
  }
  return data as { ok: boolean; rowCount: number }
}

export type UserExcelColumnSetting = { column_name: string; is_visible: boolean }

export type UserExcelDataResponse = {
  sampleColumns: { id: string; header: string; index: number }[]
  sourceRowCount: number
  rows: { rowIndex: number; cells: Record<string, string> }[]
  columnSettings: UserExcelColumnSetting[]
}

export async function fetchUserExcelData(token: string): Promise<UserExcelDataResponse> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<UserExcelDataResponse>('/api/user/excel-data', { token })
}

export async function uploadUserExcelData(token: string, file: File): Promise<{ ok: boolean; rowCount: number }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(resolveApiUrl('/api/user/excel-data'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  })
  const text = await res.text()
  let data: unknown
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(text || MSG_PARSE_FAIL, res.status)
  }
  if (!res.ok) {
    const msg =
      typeof (data as { message?: string })?.message === 'string'
        ? (data as { message: string }).message
        : '업로드에 실패했습니다.'
    throw new ApiError(msg, res.status)
  }
  return data as { ok: boolean; rowCount: number }
}

export async function patchUserExcelColumns(
  token: string,
  body: { column_name: string; is_visible: boolean }[],
): Promise<{ ok: boolean }> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest('/api/user/excel-columns', { method: 'PATCH', token, body: JSON.stringify(body) })
}

export type GaCustomerExcelDataRow = { rowIndex: number; cells: Record<string, string> }

export async function fetchCustomerGaExcelData(
  token: string,
  customerId: number,
): Promise<{
  displayHeaders: string[]
  displayColumnIds: string[]
  rows: GaCustomerExcelDataRow[]
  sourceRowCount?: number
  message: string
  /** 서버가 표시 열 비어 있음을 샘플/행 키로 보강했을 때 */
  displayColumnFallback?: boolean
}> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest(`/api/customers/${customerId}/ga-excel-data`, { token })
}
