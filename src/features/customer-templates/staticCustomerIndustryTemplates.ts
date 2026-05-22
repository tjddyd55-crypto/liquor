import type { CustomerIndustryTemplate } from './customerTemplate.types'
import { governmentCustomerTemplateV01 } from './government/governmentCustomerTemplateV01'
import { gymCustomerTemplateV01 } from './gym/gymCustomerTemplateV01'
import { insuranceCustomerTemplateV01 } from './insurance/insuranceCustomerTemplate'
import { liquorCustomerTemplateV01 } from './liquor/liquorCustomerTemplateV01'

/**
 * 코드에 선언된 업종별 고객 템플릿 전부(보험·국가지원·체육관·주류 placeholder).
 * 플랫폼 관리 화면·미리보기·향후 Customers 연결 공통 단일 진실 원천.
 */
export const STATIC_CUSTOMER_INDUSTRY_TEMPLATES: readonly CustomerIndustryTemplate[] = Object.freeze([
  insuranceCustomerTemplateV01,
  governmentCustomerTemplateV01,
  gymCustomerTemplateV01,
  liquorCustomerTemplateV01,
])
