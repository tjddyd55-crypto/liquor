/**
 * 주류(liquor) 동적 고객관리 템플릿 — 빌더 프리셋.
 * 서버 회귀 픽스처와 동일 소스(`server/crm/fixtures/liquorCompanyDynamicCrmTemplateBody.js`)를 쓰므로
 * 스크립트/서버 normalize 결과와 형태가 맞습니다. 민감정보 없음(순수 템플릿 정의만).
 */

import { buildLiquorCompanyDynamicCrmTemplateBody } from '../../../../../../../server/crm/fixtures/liquorCompanyDynamicCrmTemplateBody.js'
import { crmTemplateSaveApiBodyToDraft } from '../crmTemplateBuilder.converters'
import type { CrmTemplateDraft } from '../crmTemplateBuilder.types'

export const LIQUOR_CRM_TEMPLATE_PRESET_NAME = '주류회사 고객관리 템플릿'

/** 서버 픽스처와 동일 본문 → 빌더 draft (core placeholder 3필드) */
export function buildLiquorCrmTemplatePresetDraft(): CrmTemplateDraft {
  const body = buildLiquorCompanyDynamicCrmTemplateBody() as Record<string, unknown>
  return crmTemplateSaveApiBodyToDraft(body)
}
