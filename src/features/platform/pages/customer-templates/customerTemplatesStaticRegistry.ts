import type { CustomerIndustryTemplate } from '../../../customer-templates/customerTemplate.types'
import { STATIC_CUSTOMER_INDUSTRY_TEMPLATES } from '../../../customer-templates/staticCustomerIndustryTemplates'

/**
 * Super Admin 조회용 정적 템플릿 목록.
 * 새 업종 템플릿을 선언하면 `staticCustomerIndustryTemplates` 한곳에만 추가하면 된다.
 */
export const PLATFORM_ADMIN_STATIC_CUSTOMER_TEMPLATES: readonly CustomerIndustryTemplate[] =
  STATIC_CUSTOMER_INDUSTRY_TEMPLATES
