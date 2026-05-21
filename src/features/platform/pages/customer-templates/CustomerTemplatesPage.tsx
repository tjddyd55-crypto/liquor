import { Link } from 'react-router-dom'
import ResponsiveLayout from '../../../../components/ResponsiveLayout'
import type { CustomerIndustryTemplate } from '../../../customer-templates/customerTemplate.types'
import { PLATFORM_ADMIN_STATIC_CUSTOMER_TEMPLATES } from './customerTemplatesStaticRegistry'
import CustomerTemplatesMobileView from './CustomerTemplatesMobileView'
import CustomerTemplatesPCView from './CustomerTemplatesPCView'

export type CustomerTemplatesViewProps = {
  templates: readonly CustomerIndustryTemplate[]
}

export default function CustomerTemplatesPage() {
  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform" className="platform-admin-page__back">
          ← 플랫폼 관리
        </Link>
      </div>
      <ResponsiveLayout<CustomerTemplatesViewProps>
        PC={CustomerTemplatesPCView}
        Mobile={CustomerTemplatesMobileView}
        viewProps={{ templates: PLATFORM_ADMIN_STATIC_CUSTOMER_TEMPLATES }}
      />
    </>
  )
}
