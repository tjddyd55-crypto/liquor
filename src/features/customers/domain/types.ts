import type { CustomerCrmExtension } from './crmExtension'

export interface CustomerNote {
  id: string
  content: string
  createdAt: string
}

/** DB notes jsonb: 메모 목록 + 보험가입내역(긴 텍스트) */
export interface CustomerNotesBag {
  items: CustomerNote[]
  insuranceHistory: string
}

export function normalizeCustomerNotesBag(raw: unknown): CustomerNotesBag {
  if (Array.isArray(raw)) {
    return { items: raw as CustomerNote[], insuranceHistory: '' }
  }
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const items = Array.isArray(o.items) ? (o.items as CustomerNote[]) : []
    const ih = o.insuranceHistory
    return {
      items,
      insuranceHistory: typeof ih === 'string' ? ih : '',
    }
  }
  return { items: [], insuranceHistory: '' }
}

export function customerNoteItems(c: Pick<CustomerRecord, 'notes'>): CustomerNote[] {
  return normalizeCustomerNotesBag(c.notes).items
}

export function customerInsuranceHistoryText(c: Pick<CustomerRecord, 'notes'>): string {
  return normalizeCustomerNotesBag(c.notes).insuranceHistory.trim()
}

export interface CustomerRecord {
  id: number
  userId: string
  name: string
  /** `customers.customer_code` — 동일 GA 내 고객번호 */
  customerCode?: string | null
  ssn: string
  /** null: 미선택·구데이터 */
  gender: 'male' | 'female' | null
  insuranceAge: number | null
  /** YYYY-MM-DD (customers.birth_date) */
  birthDate?: string | null
  /** YYYY-MM-DD */
  nextAgeDate: string | null
  isDriver: boolean | null
  /** 운전 시 차종 (자유 입력) */
  carType: string
  notes: CustomerNotesBag
  phone: string
  /**
   * 목록/상세 파싱(`assertCustomerDataRecord`) 이후 `phone`과 동일한 정규화 값.
   * API가 `phone_number` / `phoneNumber`만 줄 때도 UI·로그에서 camelCase로 읽기 위함.
   */
  phoneNumber?: string
  /** 레거시: 신규 저장 시 사용 안 함 */
  carrier: string
  address: string
  height: string
  weight: string
  job: string
  driving: string
  medical: string
  carNumber: string
  carModel: string
  carYear: string
  /** YYYY-MM-DD 만기·갱신 예정일 */
  renewalDate: string
  /** YYYY-MM-DD 최신 상담일 (없으면 null) */
  lastConsultDate?: string | null
  /** 중요 고객(즐겨찾기) — 목록 상단 정렬·필터에 사용 */
  isFavorite: boolean
  /** 업종별 확장 필드 (government / gym 등) — canonical fieldKey SSOT */
  crmExtension?: CustomerCrmExtension
  createdAt: string
}
