/**
 * Customer Field / Feature Module Registry 타입(SSOT 후보).
 * — DB/API/CustomersPage 에 연결하지 않는 선언 레이어만 담당한다.
 */

/** 필드 빌더/UX 그룹 */
export type CustomerFieldRegistryCategory =
  | 'core'
  | 'contact'
  | 'personal'
  | 'insurance'
  | 'vehicle'
  | 'gym'
  | 'business'
  | 'document'
  | 'custom'

/** 비즈니스 “세계” — 한 필드가 여러 domain 에 걸치면 배열로 관리한다. */
export type CustomerFieldRegistryDomain =
  | 'core'
  | 'insurance'
  | 'government'
  | 'gym'
  | 'alcohol'
  | 'gov_support'
  | 'custom'

export type CustomerFieldRegistryPrivacyLevel = 'normal' | 'sensitive' | 'identifying'

/** 직렬화·검증 힌트 */
export type CustomerFieldRegistryValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'json'
  /** 예: 향후 `enum:RiskGrade` 패턴 확장 가능 */
  | string

export type CustomerFieldRegistryStatus = 'active' | 'deprecated' | 'preview'

export type CustomerFieldStorageMapping =
  | { readonly kind: 'legacyColumn'; readonly column: string }
  | { readonly kind: 'jsonPath'; readonly path: string }
  | { readonly kind: 'extensionTable'; readonly table: string; readonly column?: string }
  | { readonly kind: 'unmapped'; readonly reason?: string }

/** v0 레벨 검증 블록(밸리데이터가 해석 가능한 최소 집합) */
export interface CustomerFieldRegistryValidation {
  readonly maxLength?: number
  readonly minLength?: number
  readonly pattern?: string
  readonly minimum?: number
  readonly maximum?: number
  readonly enumValues?: readonly string[]
}

export interface CustomerFieldRegistryEntry {
  readonly fieldKey: string
  readonly label: string
  readonly category: CustomerFieldRegistryCategory
  readonly domains: readonly CustomerFieldRegistryDomain[]
  readonly widget: string
  readonly valueType: CustomerFieldRegistryValueType
  readonly requiredDefault: boolean
  readonly visibleDefault: boolean
  readonly privacyLevel: CustomerFieldRegistryPrivacyLevel
  readonly validation: CustomerFieldRegistryValidation
  readonly description: string
  readonly storageMapping: CustomerFieldStorageMapping
  readonly status: CustomerFieldRegistryStatus
  /** 이 필드 정의가 유효해지는 customer template schema 버전 */
  readonly introducedInSchemaVersion: string
}

/** 기능 모듈 UX/문서 그룹 */
export type FeatureModuleRegistryCategory =
  | 'crm-core'
  | 'communications'
  | 'documents'
  | 'insurance'
  | 'industry-extension'
  | 'admin'
  | 'custom'

export type FeatureModuleRegistryModuleType =
  | 'detailTab'
  | 'panel'
  | 'action'
  | 'backgroundJob'
  | 'integration'

export type FeatureModuleRegistryStatus = 'active' | 'deprecated' | 'preview'

/**
 * JSON Schema 조각을 담을 수 있게 느슨하게 둔다.
 * (런타임 검증은 추후 Ajv 등으로 연결)
 */
export type FeatureModuleRegistryConfigSchema = Readonly<Record<string, unknown>>

export interface FeatureModuleRouteBinding {
  /** 예: `/customers/:customerId/files` */
  readonly pathPattern?: string
  /** 예: 라우트 name 훅 등 */
  readonly routeName?: string
}

export interface FeatureModuleApiBinding {
  readonly tag?: string
  readonly pathPrefix?: string
}

export interface FeatureModuleRegistryEntry {
  readonly featureId: string
  readonly label: string
  readonly category: FeatureModuleRegistryCategory
  readonly moduleType: FeatureModuleRegistryModuleType
  readonly domains: readonly CustomerFieldRegistryDomain[]
  readonly description: string
  readonly requiredPermissions: readonly string[]
  readonly configSchema: FeatureModuleRegistryConfigSchema
  readonly routeBinding?: FeatureModuleRouteBinding
  readonly apiBinding?: FeatureModuleApiBinding
  readonly dependencies: readonly string[]
  readonly tenantConfigKeys: readonly string[]
  readonly status: FeatureModuleRegistryStatus
}

/** 고객 리스트 컬럼이 값을 어디서 가져오는지(표시 레이어만, 실제 렌더는 CustomersPage 책임) */
export type ListColumnSourceType = 'field' | 'derived' | 'aggregate' | 'feature'

export type ListColumnRegistryStatus = CustomerFieldRegistryStatus

/**
 * 리스트 컬럼 카탈로그 — 파생(ssnMasked)·집계(lastConsultDate) 등 form field 와 분리.
 */
export interface ListColumnRegistryEntry {
  readonly columnKey: string
  readonly label: string
  readonly category: CustomerFieldRegistryCategory
  readonly domains: readonly CustomerFieldRegistryDomain[]
  readonly sourceType: ListColumnSourceType
  /** sourceType=`field`: 백 필드(registry canonical 또는 alias 해석) */
  readonly sourceFieldKey?: string
  /** sourceType=`aggregate`|`feature`: 의존 featureId */
  readonly featureDependency?: string
  readonly valueType: CustomerFieldRegistryValueType
  readonly privacyLevel: CustomerFieldRegistryPrivacyLevel
  readonly sortable: boolean
  readonly filterable: boolean
  readonly visibleDefault: boolean
  readonly description: string
  readonly status: ListColumnRegistryStatus
}
