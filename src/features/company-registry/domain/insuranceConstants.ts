import insuranceCompanyCategoryAliases from '@insurance-shared/insuranceCompanyCategoryAliases.json'

export const INSURANCE_TYPE_ORDER = ['LIFE', 'NON_LIFE', 'GENERAL'] as const

export type InsuranceCategory = (typeof INSURANCE_TYPE_ORDER)[number]

export const INSURANCE_TYPE_LABELS: Record<InsuranceCategory, string> = {
  LIFE: '생명보험',
  NON_LIFE: '손해보험',
  GENERAL: '일반보험',
}

export const INSURANCE_TYPES = INSURANCE_TYPE_ORDER.map((value) => ({
  label: INSURANCE_TYPE_LABELS[value],
  value,
}))

/**
 * 보험사명 별칭 → 구분. 서버는 동일 JSON을 로드. 수정 시 `shared/insuranceCompanyCategoryAliases.json`만 변경.
 * 보험사 **목록**은 DB(`insurance_company_master`) 단일 소스.
 */
export const INSURANCE_COMPANY_NAME_CATEGORY_OVERRIDES = insuranceCompanyCategoryAliases as Record<
  string,
  InsuranceCategory
>

export function isInsuranceCategory(value: string): value is InsuranceCategory {
  return (INSURANCE_TYPE_ORDER as readonly string[]).includes(value)
}

/** 레거시·UI 보조용. 대표번호는 DB(고객센터)만 신뢰. */
export function getInsuranceCompanyDefaultTel(): string {
  return ''
}
