export type InsurerManagerType = 'LIFE' | 'NON_LIFE'

export type InsurerManagerStatus = 'ACTIVE' | 'BLOCKED'

export interface InsurerManager {
  id: string
  /** insurance_company_master.id */
  companyId: number
  gaCode: string
  insurerType: InsurerManagerType
  insurerName: string
  managerName?: string
  username: string
  /** 관리 화면 표시용 평문(로그인은 password_hash 사용) */
  password: string
  status: InsurerManagerStatus
  createdAt: string
}
