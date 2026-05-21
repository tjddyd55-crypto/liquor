export interface InsuranceCompanyFormState {
  id: number | null
  /** 원수사 식별(등록 후 INS + 6자리). 미등록 맵 선택 시 STATIC:… */
  companyCode: string
  category: string
  name: string
  customerCenter: string
  systemPhone: string
  incallNumber: string
  visitInfo: string
}

export interface InsuranceCompanyContactDraft {
  name: string
  position: string
  phone: string
}

export interface InsuranceGeneralDraft {
  description: string
  phone: string
  fax: string
  email: string
}

/** 원수사 마스터 저장 시 스냅샷(업데이트 현황 diff용) */
export interface CompanyHistorySnapshot {
  customerCenter: string
  system: string
  incall: string
  visitInfo: string
  contacts: Array<{ name: string; position: string; phone: string }>
}

export interface CompanyUpdateHistoryItem {
  id: string
  companyId?: string
  companyName: string
  category?: string
  updatedAt: string
  updatedBy: string
  before: CompanyHistorySnapshot
  after: CompanyHistorySnapshot
}

/** @deprecated API가 CompanyUpdateHistoryItem[] 반환 */
export type CompanyRecentUpdate = CompanyUpdateHistoryItem

/** 2차 드롭다운 옵션(SSOT: DB 목록에서만 구성) */
export interface InsuranceCompanyOption {
  companyCode: string
  name: string
  tel: string
}

export interface CompanyDirectoryEntry {
  id: number
  companyCode: string
  category: string
  name: string
  customerCenter: string
  systemPhone: string
  incallNumber: string
  visitInfo: string
  createdAt?: string
  updatedAt?: string
  updatedBy?: string
  contacts: Array<
    InsuranceCompanyContactDraft & {
      id: number
      companyId: number
    }
  >
  general: (InsuranceGeneralDraft & { id: number; companyId: number }) | null
}
