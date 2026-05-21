/** 클라이언트 빌더 — 서버 `crmCustomerManagementTemplateNormalize.js` 규약과 동기 */

export const CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'radio',
  'checkbox',
  'phone',
] as const

export type CrmTemplateBuilderFieldType = (typeof CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES)[number]

export const CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES = ['auto', 'text', 'date', 'number'] as const

export type CrmTemplateListColumnDisplayType = (typeof CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES)[number]

export const CRM_TEMPLATE_LIFECYCLE_STATUSES = ['draft', 'active', 'archived'] as const

export type CrmTemplateLifecycleStatus = (typeof CRM_TEMPLATE_LIFECYCLE_STATUSES)[number]

/** 코어 DB 경로 허용 키(extension 이 아닌 storage: core 일 때만) */
export const CRM_TEMPLATE_CORE_STORAGE_KEYS = [
  'customer.name',
  'customer.phone',
  'customer.ssn',
  'insurance.ssn',
  'customer.gender',
  'customer.address',
  'customer.job',
  'customer.height',
  'customer.weight',
  'customer.birthDate',
  'customer.carrier',
  'customer.memo',
] as const

export const CRM_TEMPLATE_FIELD_KEY_REGEX = /^[a-zA-Z][a-zA-Z0-9_.]*$/

/** 확장(canonical) 키 직접 입력 시 플레이스홀더 가이드 */
export const CRM_TEMPLATE_EXTENSION_KEY_INPUT_PLACEHOLDER =
  '예: biz.customField1 · gym.membershipType · gov.caseNumber'

export const CRM_TEMPLATE_TAB_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/

export const CRM_TEMPLATE_DEFAULT_SHARED_BINDINGS = ['crm-storage-files', 'crm-consultations'] as const
