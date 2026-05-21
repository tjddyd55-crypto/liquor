/**
 * 업종별 고객 관리 템플릿(선언만) 및 tenant.config.crm merger 입력 타입.
 * — 렌더/권한/API는 포함하지 않는다.
 */

/**
 * 동적 CRM 빌더에서 임의 `industry_code`가 그대로 domain에 매핑될 수 있다.
 * 알려진 상수 업종 외 문자열도 허용한다.
 */
export type CustomerTemplateDomain =
  | 'core'
  | 'insurance'
  | 'government'
  | 'gym'
  | 'liquor'
  | (string & {})

/** 필드 민감도(표시 마스킹·감사 UI 등 향후 훅) */
export type CustomerTemplatePrivacyLevel = 'normal' | 'sensitive' | 'identifying'

/** v0.1: 문자열로 두고 렌더기가 해석한다. 이후 버전에서 union 좁히기 가능 */
export type CustomerTemplateFormWidget = string

export interface CustomerTemplateMeta {
  templateId: string
  industryCode: string
  /** 템플릿 문서 버전(예 "0.1") */
  version: string
  /** 이 타입 정의 호환 레이어(예 "0.1") */
  schemaVersion: string
  /** DB 동적 템플릿 primary key (`dynamic:{id}` 와 함께 사용) */
  dynamicTemplateDbId?: number
  /** 동적 템플릿 활성 상태(서버 원본 보존용) */
  status?: string
}

export interface CustomerTemplateFormField {
  fieldKey: string
  label: string
  widget: CustomerTemplateFormWidget
  required: boolean
  visibleDefault: boolean
  order: number
  privacyLevel: CustomerTemplatePrivacyLevel
  domain: CustomerTemplateDomain
  placeholder?: string
  sectionId?: string
  sectionLabel?: string
  options?: ReadonlyArray<{ value: string; label: string }>
  /** 빌더 전용 — 코어 DB 컬럼 vs crm_extension */
  storage?: 'core' | 'extension'
}

export interface CustomerTemplateListColumn {
  columnKey: string
  label: string
  order: number
  visibleDefault: boolean
  domain: CustomerTemplateDomain
  /** 동적 목록 등 레지스트리 없이 목록 표시값을 만들 때(canonical 원천 키) */
  sourceFieldKey?: string
  /**
   * 목록 카드 한 줄 표시 포맷
   * - auto: 연결된 폼 필드(widget) 타입에 맞춤
   */
  displayType?: 'auto' | 'text' | 'date' | 'number'
}

export interface CustomerTemplateDetailTab {
  tabId: string
  label: string
  /** shared 또는 업종 확장 기능 식별자 */
  featureBinding: string
  order: number
  domain: CustomerTemplateDomain
  visibleDefault: boolean
  /** 동적 빌더: 탭별로 묶을 폼 필드 키(비어 있으면 정적 레이아웃 미리보기 규약 사용) */
  fieldKeys?: readonly string[]
}

/** 단일 업종(customer) 템플릿 레코드 — 보험은 extensionFeatureBindings 채운다 */
export interface CustomerIndustryTemplate {
  meta: CustomerTemplateMeta
  formFields: readonly CustomerTemplateFormField[]
  listColumns: readonly CustomerTemplateListColumn[]
  detailTabs: readonly CustomerTemplateDetailTab[]
  /** 공통 CRM 기능 슬롯 */
  sharedFeatureBindings: readonly string[]
  /** 업종 전용 기능 슬롯(예: 보험) */
  extensionFeatureBindings: readonly string[]
  /** 동적 빌더 원본 메타(선택) */
  metadata?: Record<string, unknown>
}

/** tenant.config 에 넣게 될 CRM 오버레이 구조 예시(.crm) */
export interface TenantCrmConfig {
  /** `tabId` 또는 향후 `feature.xxx` 키 — `false`면 해당 탭/기본 노출 숨김 */
  featureFlags?: Readonly<Record<string, boolean>>
  /** `fieldKey` 기준 속성 패치 */
  fieldOverrides?: Readonly<
    Record<string, Partial<Pick<CustomerTemplateFormField, 'label' | 'required' | 'visibleDefault'>>>
  >
  /** 우선 필드 라벨, 동일 키가 detail tabId와 충돌하지 않도록 운영에서 관리 */
  labels?: Readonly<Record<string, string>>
}

export interface TenantConfigWithCrm {
  crm?: TenantCrmConfig
}
