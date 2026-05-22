/**
 * 검증 픽스처: 주류 업종(liquor) v1 동적 템플릿.
 */

const IC = 'liquor'

/** @returns {Record<string, unknown>} */
export function buildLiquorCompanyDynamicCrmTemplateBody() {
  const form_fields = [
    fk('거래처명', 'customer.name', 'core', 'text', true),
    fk('연락처', 'customer.phone', 'core', 'phone', true),
    fk('주소', 'customer.address', 'core', 'textarea', false),
    {
      ...fk('거래처 구분', 'liquor.partyType', 'extension', 'select', true),
      options: [
        { value: 'individual', label: '개인' },
        { value: 'business', label: '사업장' },
      ],
    },
    {
      ...fk('거래처 상태', 'liquor.accountStatus', 'extension', 'select', false),
      options: [
        { value: 'active', label: '거래중' },
        { value: 'paused', label: '거래중지' },
        { value: 'closed', label: '거래종료' },
      ],
    },
  ].map((f, idx) => ({ ...f, order: (idx + 1) * 10, domain: IC }))

  const list_columns = [
    lc('거래처명', 'customer_name', 'customer.name'),
    lc('연락처', 'customer_phone', 'customer.phone'),
    lc('구분', 'liquor_party_type', 'liquor.partyType'),
    lc('상태', 'liquor_account_status', 'liquor.accountStatus'),
  ].map((c, idx) => ({ ...c, order: (idx + 1) * 10, domain: IC }))

  const detail_tabs = [
    tab('liquor_basic', '기본정보', 'liquor-customer-profile'),
    tab('liquor_contacts', '담당자', 'liquor-customer-contacts'),
    tab('liquor_support', '지원/채권', 'liquor-support-contracts'),
    tab('liquor_repayments', '상환내역', 'liquor-repayments'),
    tab('liquor_items', '지원물품', 'liquor-support-items'),
    tab('liquor_files', '첨부문서', 'liquor-customer-files'),
    tab('liquor_notes', '메모/활동', 'liquor-customer-notes'),
    tab('liquor_signatures', '전자서명', 'liquor-signatures-link'),
  ]

  return {
    name: '주류회사 고객관리 템플릿 v1',
    industry_code: IC,
    description: '주류 거래처·지원계약·상환·물품 구조화 템플릿',
    status: 'active',
    form_fields,
    list_columns,
    detail_tabs,
    shared_feature_bindings: ['crm-storage-files', 'crm-consultations', 'crm-inline-notes'],
    extension_feature_bindings: [
      'liquor-customer-profile',
      'liquor-customer-contacts',
      'liquor-support-contracts',
      'liquor-repayments',
      'liquor-support-items',
      'liquor-customer-files',
      'liquor-customer-notes',
      'liquor-signatures-link',
    ],
  }
}

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

function fk(label, fieldKey, storage, type, required = false) {
  return { ...baseField(fieldKey, storage, type), label, required }
}

function lc(label, columnKey, sourceFieldKey) {
  return { columnKey, label, sourceFieldKey, visibleDefault: true, domain: IC }
}

function tab(tabId, label, featureBinding) {
  return { tabId, label, featureBinding, order: 10, visibleDefault: true, domain: IC }
}
