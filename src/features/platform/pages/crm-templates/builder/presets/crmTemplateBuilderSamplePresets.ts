/**
 * 빌더 «샘플 불러오기» 레지스트리.
 * 테스트·온보딩용 초안일 뿐이며, 운영 템플릿은 전부 빌더 UI에서 작성하는 것을 전제로 한다.
 */

import type { CrmTemplateDraft } from '../crmTemplateBuilder.types'
import {
  buildLiquorCrmTemplatePresetDraft,
  LIQUOR_CRM_TEMPLATE_PRESET_NAME,
} from './liquorDynamicCrmTemplatePreset'

export type CrmTemplateBuilderSamplePreset = {
  id: string
  label: string
  /** 샘플이 기대하는 industry 코드 (불러올 때 select 값과 함께 맞춤) */
  industryCode: string
  /** 템플릿 이름 입력란이 비어 있을 때만 채운다 */
  suggestedTemplateName: string
  buildDraft: () => CrmTemplateDraft
  helperText: string
}

export const CRM_TEMPLATE_BUILDER_SAMPLE_PRESETS: readonly CrmTemplateBuilderSamplePreset[] =
  Object.freeze([
    Object.freeze({
      id: 'liquor-company-test-fixture',
      label: `${LIQUOR_CRM_TEMPLATE_PRESET_NAME} (테스트 픽스처와 동형)`,
      industryCode: 'liquor',
      suggestedTemplateName: LIQUOR_CRM_TEMPLATE_PRESET_NAME,
      buildDraft: buildLiquorCrmTemplatePresetDraft,
      helperText:
        'core 필드 placeholder(고객명·연락처·주소). Industry 코드는 liquor로 설정됩니다. 고객 항목 확정 후 교체 예정.',
    }),
  ])
