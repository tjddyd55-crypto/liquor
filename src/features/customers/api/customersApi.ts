import type { InsuranceApplicationRecord } from '../../application/domain/types'
import { ApiError, apiRequest } from '../../../lib/apiClient'
import type { CustomerNote, CustomerNotesBag, CustomerRecord } from '../domain/types'
import { normalizeCustomerCrmExtension, type CustomerCrmExtension } from '../domain/crmExtension'
import type { CustomerCarFormItem } from '../types/customerCarForm'

export type ListCustomersResult = {
  customers: CustomerRecord[]
  /** 삭제 제외, 동일 user·GA 스코프의 DB 전체 건수 */
  total: number
}

export type AssertCustomerDataOptions = {
  /** 목록 파싱 시 에러·로그에 인덱스 포함 */
  listIndex?: number
  /** PUT/POST 등 API 문맥 */
  context?: string
}

/**
 * 단일 고객 객체 무결성. null·비객체·id 누락 시 즉시 예외 (목록/상세 공통).
 * 잘못된 행을 건너뛰지 않아 데이터 문제를 바로 드러낸다.
 */
export function assertCustomerDataRecord(
  c: unknown,
  options?: AssertCustomerDataOptions,
): CustomerRecord {
  const listIndex = options?.listIndex
  const context = options?.context
  const label =
    listIndex != null && listIndex >= 0 ? `목록 인덱스 ${listIndex}` : context ? context : '고객 데이터'

  if (!c || typeof c !== 'object') {
    console.error('[customersApi] ❌ invalid customer object:', label, c)
    throw new ApiError(
      listIndex != null && listIndex >= 0
        ? `고객 목록 ${listIndex}번째 항목이 유효하지 않습니다.`
        : `유효하지 않은 고객 데이터입니다${context ? ` (${context})` : ''}.`,
      500,
    )
  }
  const id = (c as { id?: unknown }).id
  if (typeof id !== 'number' || !Number.isFinite(id)) {
    console.error('[customersApi] ❌ customer missing id:', label, c)
    throw new ApiError(
      listIndex != null && listIndex >= 0
        ? `고객 목록 ${listIndex}번째 항목에 id가 없습니다.`
        : `고객 id가 응답에 없습니다${context ? ` (${context})` : ''}.`,
      500,
    )
  }
  const row = c as Record<string, unknown>
  const withFlag = c as CustomerRecord & { isFavorite?: unknown }
  const phoneFromPrimary = typeof withFlag.phone === 'string' ? withFlag.phone.trim() : ''
  const phoneFromSnake = typeof row.phone_number === 'string' ? row.phone_number.trim() : ''
  const phoneFromCamel = typeof row.phoneNumber === 'string' ? row.phoneNumber.trim() : ''
  const phone = phoneFromPrimary || phoneFromSnake || phoneFromCamel

  const crmExtension = normalizeCustomerCrmExtension(row.crmExtension ?? row.crm_extension)

  return {
    ...withFlag,
    phone,
    phoneNumber: phone,
    isFavorite: withFlag.isFavorite === true,
    crmExtension,
  }
}

/**
 * 고객 생성·수정 API: 서버는 `{ success, data: CustomerRecord }`를 주고,
 * apiRequest → safeApiResponse 가 `data`만 펼친 경우도 있다. 둘 다 처리한다.
 */
function normalizeCustomerMutationResponse(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw
  }
  const o = raw as Record<string, unknown>
  if ('success' in o && 'data' in o && o.data !== undefined) {
    return o.data
  }
  return raw
}

function dedupeCustomersById(rows: CustomerRecord[]): CustomerRecord[] {
  const seen = new Set<number>()
  const deduped: CustomerRecord[] = []
  for (const row of rows) {
    if (seen.has(row.id)) {
      continue
    }
    seen.add(row.id)
    deduped.push(row)
  }
  return deduped
}

export async function listCustomers(token: string, limit = 500): Promise<ListCustomersResult> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const query = limit ? `?limit=${encodeURIComponent(String(limit))}` : ''
  const body = await apiRequest<{ data?: unknown; total?: unknown } | unknown[]>(`/api/customers${query}`, { token })

  let rawRows: unknown[]
  let totalFromBody: number | undefined

  if (Array.isArray(body)) {
    rawRows = body
  } else {
    if (!body || typeof body !== 'object') {
      throw new ApiError('customers 응답 구조 오류입니다.', 500)
    }
    const data = (body as { data?: unknown }).data
    if (!Array.isArray(data)) {
      throw new ApiError('customers 응답 구조 오류: data가 배열이 아닙니다.', 500)
    }
    rawRows = data
    const t = (body as { total?: unknown }).total
    totalFromBody = typeof t === 'number' && Number.isFinite(t) ? t : undefined
  }

  /** DEV: 한 건라도 깨지면 즉시 실패. PROD: 무효 행만 건너뛰고 목록은 유지. */
  const customers = import.meta.env.DEV
    ? rawRows.map((row, idx) => assertCustomerDataRecord(row, { listIndex: idx }))
    : rawRows
        .map((row) => {
          try {
            return assertCustomerDataRecord(row)
          } catch (e) {
            console.error('[listCustomers] invalid row skipped', row, e)
            return null
          }
        })
        .filter((c): c is CustomerRecord => c != null)

  const total =
    totalFromBody != null && Number.isFinite(totalFromBody)
      ? totalFromBody
      : customers.length

  return { customers, total }
}

export async function listCustomerForms(
  token: string,
  customerId: number,
): Promise<InsuranceApplicationRecord[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  return apiRequest<InsuranceApplicationRecord[]>(`/api/customers/${customerId}/forms`, { token })
}

export async function searchCustomers(
  token: string,
  q: string,
  options?: { scopeGaId?: number | null },
): Promise<CustomerRecord[]> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const query = new URLSearchParams()
  const trimmed = q.trim()
  if (trimmed) {
    query.set('q', trimmed)
  }
  query.set('limit', '20')
  const sga = options?.scopeGaId
  if (sga != null && Number.isFinite(Number(sga)) && Number(sga) > 0) {
    query.set('scope_ga_id', String(sga))
  }
  const suffix = `?${query.toString()}`
  const rows = await apiRequest<CustomerRecord[]>(`/api/customers/search${suffix}`, { token })
  if (!Array.isArray(rows)) {
    throw new ApiError('고객 검색 응답 형식이 올바르지 않습니다.', 500)
  }
  return dedupeCustomersById(
    import.meta.env.DEV
      ? rows.map((row, idx) => assertCustomerDataRecord(row, { listIndex: idx }))
      : rows
          .map((row) => {
            try {
              return assertCustomerDataRecord(row)
            } catch (e) {
              console.error('[searchCustomers] invalid row skipped', row, e)
              return null
            }
          })
          .filter((c): c is CustomerRecord => c != null),
  )
}

export async function getCustomerById(
  token: string,
  customerId: number,
): Promise<CustomerRecord | null> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  if (!Number.isInteger(customerId) || customerId < 1) {
    return null
  }
  try {
    const raw = await apiRequest<unknown>(`/api/customers/${customerId}`, { token })
    return assertCustomerDataRecord(raw, { context: '고객 상세 조회' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return null
    }
    throw error
  }
}

export interface SaveCustomerPayload {
  name: string
  ssn?: string
  gender?: 'male' | 'female' | '' | null
  isDriver?: boolean | null
  carType?: string
  /** 레거시: 배열만 보내면 서버가 { items, insuranceHistory: '' }로 저장 */
  notes?: CustomerNote[] | CustomerNotesBag
  phone?: string
  carrier?: string
  address?: string
  height?: string
  weight?: string
  job?: string
  driving?: string
  medical?: string
  /** 등록 시 차량(고객 테이블 car_* 컬럼) — 선택 입력 */
  carNumber?: string
  carModel?: string
  carYear?: string
  renewalDate?: string
  /** YYYY-MM-DD */
  birthDate?: string
  crmExtension?: CustomerCrmExtension
  /** 다건 자동차(서버가 무시할 수 있음 — 대표차량은 car_* 로 동기화) */
  cars?: CustomerCarFormItem[]
  isFavorite?: boolean
}

export interface UpdateCustomerCarPayload {
  carNumber: string
  carModel: string
  carYear: string
  renewalDate: string
}

/** 프로필·차량 필드 중 전달한 키만 서버에서 갱신 */
export type UpdateCustomerPayload = Partial<SaveCustomerPayload> & Partial<UpdateCustomerCarPayload>

function drivingTextFromIsDriver(isDriver: boolean | null): string {
  if (isDriver === true) {
    return '운전함'
  }
  if (isDriver === false) {
    return '운전 안함'
  }
  return ''
}

function normalizeCustomerRenewalDateForPut(raw: string | undefined | null): string {
  const s = String(raw ?? '').trim()
  if (!s) {
    return ''
  }
  const head = s.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(head) ? head : ''
}

/**
 * 메모 등 부분 UI에서도 편집 저장과 동일한 필드 구성으로 PUT해
 * 게이트웨이·서버가 기대하는 본문 형태를 맞춘다.
 */
export function customerRecordToUpdatePayload(
  customer: CustomerRecord,
  notes: CustomerNotesBag,
): UpdateCustomerPayload {
  const extFields = customer.crmExtension?.fields
  const hasExtension = extFields != null && typeof extFields === 'object' && Object.keys(extFields).length > 0
  return {
    name: customer.name.trim(),
    ssn: customer.ssn,
    phone: customer.phone,
    carrier: String(customer.carrier ?? '').trim(),
    address: customer.address,
    height: customer.height,
    weight: customer.weight,
    job: customer.job,
    driving: drivingTextFromIsDriver(customer.isDriver),
    medical: customer.medical,
    gender: customer.gender,
    isDriver: customer.isDriver,
    carType: (customer.carType ?? '').trim(),
    notes,
    carNumber: customer.carNumber,
    carModel: customer.carModel,
    carYear: String(customer.carYear ?? '').replace(/\D/g, ''),
    renewalDate: normalizeCustomerRenewalDateForPut(customer.renewalDate),
    isFavorite: customer.isFavorite === true,
    ...(hasExtension
      ? {
          crmExtension: {
            v: customer.crmExtension?.v ?? 1,
            fields: { ...(customer.crmExtension?.fields ?? {}) },
          } satisfies CustomerCrmExtension,
        }
      : {}),
  }
}

export async function updateCustomer(
  token: string,
  customerId: number,
  payload: UpdateCustomerPayload,
): Promise<CustomerRecord> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  if (!Number.isInteger(customerId) || customerId < 1) {
    throw new ApiError('updateCustomer: 유효한 고객 id가 없습니다.', 400)
  }
  const raw = await apiRequest<unknown>(`/api/customers/${customerId}`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  })
  return assertCustomerDataRecord(normalizeCustomerMutationResponse(raw), { context: '고객 수정' })
}

export async function updateCustomerCar(
  token: string,
  customerId: number,
  payload: UpdateCustomerCarPayload,
): Promise<CustomerRecord> {
  return updateCustomer(token, customerId, {
    carNumber: payload.carNumber,
    carModel: payload.carModel,
    carYear: payload.carYear,
    renewalDate: payload.renewalDate,
  })
}

export async function deleteCustomer(token: string, customerId: number): Promise<void> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  await apiRequest<{ success: boolean }>(`/api/customers/${customerId}`, {
    method: 'DELETE',
    token,
  })
}

export async function saveCustomer(
  token: string,
  payload: SaveCustomerPayload,
): Promise<CustomerRecord> {
  if (!token?.trim()) {
    throw new ApiError('로그인이 필요합니다.', 401)
  }
  const raw = await apiRequest<unknown>('/api/customers', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
  return assertCustomerDataRecord(normalizeCustomerMutationResponse(raw), { context: '고객 등록' })
}

/** 로그인 없이 ref(담당자 user id) 계정으로 고객 저장 (외부 입력 전용) */
export async function saveCustomerExternal(
  refUserId: string,
  payload: SaveCustomerPayload,
): Promise<CustomerRecord> {
  // 반드시 POST /api/customer/external-create 로 전송 (resolveApiUrl이 절대/상대 베이스 모두 처리)
  const raw = await apiRequest<unknown>('/api/customer/external-create', {
    method: 'POST',
    body: JSON.stringify({ refUserId, ...payload }),
  })
  return assertCustomerDataRecord(normalizeCustomerMutationResponse(raw), { context: '외부 고객 등록' })
}
