/**
 * 검증 픽스처: 주류 업종(liquor) placeholder 동적 템플릿.
 * 고객 필드는 아직 미확정 — core 필드만 포함한다.
 */

const IC = 'liquor'

/** @returns {Record<string, unknown>} */
export function buildLiquorCompanyDynamicCrmTemplateBody() {
  const form_fields = [
    fk('고객명', 'customer.name', 'core', 'text'),
    fk('연락처', 'customer.phone', 'core', 'phone'),
    fk('주소', 'customer.address', 'core', 'textarea'),
  ].map((f, idx) => ({ ...f, order: (idx + 1) * 10, domain: IC }))

  const list_columns = [
    lc('고객명', 'customer_name', 'customer.name'),
    lc('연락처', 'customer_phone', 'customer.phone'),
  ].map((c, idx) => ({ ...c, order: (idx + 1) * 10, domain: IC }))

  const detail_tabs = [
    {
      tabId: 'liquor_basic',
      label: '기본 정보',
      fieldKeys: ['customer.name', 'customer.phone', 'customer.address'],
      order: 10,
      visibleDefault: true,
      domain: IC,
      featureBinding: 'dynamic.liquor_basic',
    },
  ]

  return {
    name: '주류회사 고객관리 템플릿 (placeholder)',
    industry_code: IC,
    description: '고객 필드 미확정 — core placeholder. 확정 후 교체 예정.',
    status: 'active',
    form_fields,
    list_columns,
    detail_tabs,
    shared_feature_bindings: ['crm-storage-files', 'crm-consultations', 'crm-inline-notes'],
    extension_feature_bindings: [],
  }
}

/** @returns {Record<string, unknown>} */
function baseField(fieldKey, storage, type) {
  return {
    fieldKey,
    label: '',
    type,
    widget: type,
    required: false,
    placeholder: '',
    visibleDefault: true,
    storage,
    privacyLevel: 'normal',
    options: [],
    domain: IC,
  }
}

function fk(label, fieldKey, storage, type) {
  return { ...baseField(fieldKey, storage, type), label }
}

function lc(label, columnKey, sourceFieldKey) {
  return { columnKey, label, sourceFieldKey, visibleDefault: true, domain: IC }
}
