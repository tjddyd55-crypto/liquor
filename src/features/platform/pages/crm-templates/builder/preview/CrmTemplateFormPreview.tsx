import type { CustomerIndustryTemplate } from '../../../../../customer-templates/customerTemplate.types'
import CustomerIndustryTemplateFields from '../../../../../customers/components/CustomerIndustryTemplateFields'
import type { CustomerEditFormState } from '../../../../../customers/types/customerEditForm'
import { buildPreviewBinderWithSamples } from './crmTemplatePreviewSampleValues'
import type { CrmTemplateDraft } from '../crmTemplateBuilder.types'

type Props = {
  template: CustomerIndustryTemplate | null
  draft: CrmTemplateDraft
}

/** 등록 폼 미리보기 — 저장·API 호출 없음 */
export default function CrmTemplateFormPreview({ template, draft }: Props) {
  if (!template) {
    return <p className="platform-admin-page__muted text-sm">Industry를 선택하고 필드를 추가하면 미리보기가 표시됩니다.</p>
  }

  const visibleCount = template.formFields.filter((f) => f.visibleDefault !== false).length
  if (visibleCount === 0) {
    return <p className="platform-admin-page__muted text-sm">표시할 필드가 없습니다. 「화면 표시」를 켜 주세요.</p>
  }

  const binder: CustomerEditFormState = buildPreviewBinderWithSamples(draft)

  return (
    <div className="crm-template-builder__preview-pane crm-template-builder__preview-pane--form">
      <fieldset disabled className="crm-template-builder__preview-fieldset">
        <CustomerIndustryTemplateFields
          template={template}
          value={binder}
          onPatch={() => {}}
          variant="create"
          radioSuffix="crm-builder-form-preview"
          readOnlyPreview
        />
      </fieldset>
      <div className="crm-template-builder__preview-form-actions">
        <button type="button" className="filter-button filter-button--workspace-active" disabled tabIndex={-1}>
          등록
        </button>
        <button type="button" className="filter-button" disabled tabIndex={-1}>
          취소
        </button>
      </div>
    </div>
  )
}
