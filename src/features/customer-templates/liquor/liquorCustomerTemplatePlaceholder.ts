import type { CustomerIndustryTemplate } from '../customerTemplate.types'

/**
 * 주류회사 CRM 고객 템플릿 — 임시 placeholder.
 *
 * 고객 필드는 아직 확정되지 않았다. core 필드만 두고 extension 필드는 추가하지 않는다.
 * 확정 후 DB 동적 템플릿 또는 이 정적 정의를 교체한다.
 */
export const liquorCustomerTemplatePlaceholder: CustomerIndustryTemplate = {
  meta: {
    templateId: 'liquor_customer_placeholder_v1',
    industryCode: 'liquor',
    version: '0.1.0',
    schemaVersion: 'customer-template.v1',
  },
  sharedFeatureBindings: Object.freeze([
    'crm-storage-files',
    'crm-consultations',
    'crm-inline-notes',
  ]),
  extensionFeatureBindings: Object.freeze([]),
  formFields: Object.freeze([
    {
      fieldKey: 'customer.name',
      label: '고객명',
      widget: 'text',
      required: true,
      visibleDefault: true,
      order: 100,
      privacyLevel: 'normal',
      domain: 'liquor',
    },
    {
      fieldKey: 'customer.phone',
      label: '연락처',
      widget: 'phone',
      required: true,
      visibleDefault: true,
      order: 110,
      privacyLevel: 'normal',
      domain: 'liquor',
    },
    {
      fieldKey: 'customer.address',
      label: '주소',
      widget: 'textarea',
      required: false,
      visibleDefault: true,
      order: 120,
      privacyLevel: 'normal',
      domain: 'liquor',
    },
  ]),
  listColumns: Object.freeze([
    {
      columnKey: 'customer_name',
      label: '고객명',
      sourceFieldKey: 'customer.name',
      visibleDefault: true,
      order: 100,
      domain: 'liquor',
    },
    {
      columnKey: 'customer_phone',
      label: '연락처',
      sourceFieldKey: 'customer.phone',
      visibleDefault: true,
      order: 110,
      domain: 'liquor',
    },
  ]),
  detailTabs: Object.freeze([
    {
      tabId: 'liquor_basic',
      label: '기본 정보',
      fieldKeys: Object.freeze(['customer.name', 'customer.phone', 'customer.address']),
      order: 100,
      visibleDefault: true,
      domain: 'liquor',
      featureBinding: 'dynamic.liquor_basic',
    },
  ]),
}
