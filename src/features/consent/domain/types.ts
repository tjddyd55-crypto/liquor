/**
 * 동의서 플로우 라우팅 state
 * 템플릿은 (ga_id + insurance_company_id)로 결정됨
 */
export interface ConsentCompanySelection {
  gaId: number
  insuranceCompanyId: string
  insuranceCompanyName: string
  /** consent_templates 식별자 (GA·보험사 조합으로 조회된 결과) */
  consentTemplateId: string
}

export interface ConsentCompanyItem {
  id: string
  name: string
}

export interface ConsentFormData {
  name: string
  ssn: string
  phone: string
}
