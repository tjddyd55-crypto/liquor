import type { CustomerIndustryTemplate, CustomerTemplateFormField } from '../../customer-templates/customerTemplate.types'
import { resolveCanonicalFieldKey } from '../../customer-templates'
import { normalizeBirthDateForSaveApi } from '../domain/crmExtension'

/** `CustomerFormState` / `CustomerEditFormState` 와 호환되는 업종 템플릿 검증용 슬라이스 */
export type IndustryTemplateFormValidationInput = {
  name: string
  gender: 'male' | 'female' | null
  phone: string
  ssn: string
  carrier: string
  birthDate: string
  address: string
  addressDetail: string
  zonecode: string
  job: string
  height: string
  weight: string
  crmExtensionFields: Record<string, string>
}

/**
 * 템플릿에서 `required: true` 인 필드를 canonical 키 기준으로 검증한다.
 * 코어 컬럼 + `crm_extension.fields` 에 매핑된 값을 사용한다.
 */
export function getCustomerIndustryTemplateFormValidationError(
  form: IndustryTemplateFormValidationInput,
  template: CustomerIndustryTemplate,
): string | null {
  const fields = [...template.formFields]
    .filter((f) => f.visibleDefault !== false)
    .sort((a, b) => a.order - b.order)

  const ext = form.crmExtensionFields ?? {}

  for (const ff of fields) {
    if (!ff.required) continue
    const canon = resolveCanonicalFieldKey(ff.fieldKey)
    const label = ff.label.trim() || '항목'

    switch (canon) {
      case 'customer.name':
        if (!form.name?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.phone':
        if (!form.phone?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.carrier':
        if (!form.carrier?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.birthDate':
        if (!form.birthDate?.trim()) return `${label}은(는) 필수입니다.`
        if (!normalizeBirthDateForSaveApi(form.birthDate)) {
          return `${label}은(는) YYYY-MM-DD 또는 YYMMDD 6자리(예 990315)로 입력해 주세요.`
        }
        break
      case 'customer.ssn':
      case 'insurance.ssn':
        if (!form.ssn?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.gender':
        if (form.gender == null) return `${label}은(는) 필수입니다.`
        break
      case 'customer.address':
        if (!form.address?.trim() && !form.zonecode?.trim()) {
          return `${label}은(는) 필수입니다.`
        }
        break
      case 'customer.job':
        if (!form.job?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.height':
        if (!form.height?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.weight':
        if (!form.weight?.trim()) return `${label}은(는) 필수입니다.`
        break
      case 'customer.memo': {
        const v = ext['customer.memo'] ?? ''
        if (!v.trim()) return `${label}은(는) 필수입니다.`
        break
      }
      default: {
        const fTyped = ff as CustomerTemplateFormField
        const v = ext[canon] ?? ''
        const opts = [...(fTyped.options ?? [])]
        if (!ff.required) break
        if (ff.widget === 'checkbox' && opts.length > 0) {
          const n = String(v ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean).length
          if (n < 1) return `${label}은(는) 필수입니다.`
          break
        }
        if (!v.trim()) return `${label}은(는) 필수입니다.`
        break
      }
    }
  }
  return null
}
