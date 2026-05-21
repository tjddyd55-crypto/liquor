import type { CrmDraftFormField, CrmDraftListColumn, CrmTemplateDraft } from '../crmTemplateBuilder.types'
import type { CustomerIndustryTemplate } from '../../../../../customer-templates/customerTemplate.types'
import type { CustomerRecord } from '../../../../../customers/domain/types'
import { mockCustomerRecordFromPreviewBinder } from '../mockCustomerForCrmTemplatePreview'
import type { CustomerEditFormState } from '../../../../../customers/types/customerEditForm'

const DEFAULT_BINDER: CustomerEditFormState = {
  name: '홍길동',
  gender: 'male',
  phone: '010-0000-0000',
  ssn: '',
  carrier: 'SKT',
  birthDate: '1990-01-15',
  address: '서울특별시 중구',
  addressDetail: '테헤란로 1',
  zonecode: '04524',
  job: '영업',
  height: '175',
  weight: '70',
  isDriver: false,
  carType: '',
  medical: '',
  insuranceHistory: '',
  cars: [],
  crmExtensionFields: {},
}

export function sampleValueForFieldType(
  fieldType: string,
  label: string,
  options?: readonly { value: string; label: string }[],
): string {
  const lab = label.trim()
  switch (fieldType) {
    case 'phone':
      return '010-0000-0000'
    case 'date':
      return '2026-05-18'
    case 'number':
      return '1,250,000'
    case 'select':
    case 'radio':
      return options?.[0]?.label?.trim() || options?.[0]?.value?.trim() || '선택값'
    case 'checkbox':
      return options?.slice(0, 2).map((o) => o.label || o.value).join(', ') || '옵션1'
    case 'textarea':
      return lab ? `${lab} 샘플 내용입니다.` : '메모 샘플 내용입니다.'
    default:
      if (/연락|전화|휴대/i.test(lab)) return '010-0000-0000'
      if (/이름|고객|거래처/i.test(lab)) return '홍길동'
      if (/상태|진행/i.test(lab)) return '진행중'
      if (/담당|영업/i.test(lab)) return '김팀장'
      if (/일|날짜/i.test(lab)) return '2026-05-18'
      if (/주소/i.test(lab)) return '서울특별시 중구'
      return lab ? `${lab} 예시` : '샘플 값'
  }
}

export function buildPreviewBinderWithSamples(
  draft: CrmTemplateDraft,
  base: CustomerEditFormState = DEFAULT_BINDER,
): CustomerEditFormState {
  const ext: Record<string, string> = { ...(base.crmExtensionFields ?? {}) }
  for (const f of draft.formFields) {
    if (f.storage !== 'extension') continue
    const k = f.fieldKey.trim()
    if (!k) continue
    if (!ext[k]) {
      ext[k] = sampleValueForFieldType(f.fieldType, f.label, f.options)
    }
  }
  return { ...base, crmExtensionFields: ext }
}

export function buildStaticPreviewMockCustomer(
  template: CustomerIndustryTemplate | null,
  draft: CrmTemplateDraft,
): CustomerRecord {
  const binder = buildPreviewBinderWithSamples(draft)
  const rec = mockCustomerRecordFromPreviewBinder(binder)
  if (!template) return rec
  return rec
}

export function sampleListCellValue(
  column: CrmDraftListColumn,
  formFields: readonly CrmDraftFormField[],
): string {
  const src = column.sourceFieldKey.trim()
  const field = formFields.find((f) => f.fieldKey.trim() === src)
  if (field) return sampleValueForFieldType(field.fieldType, column.label || field.label, field.options)
  return sampleValueForFieldType('text', column.label)
}
