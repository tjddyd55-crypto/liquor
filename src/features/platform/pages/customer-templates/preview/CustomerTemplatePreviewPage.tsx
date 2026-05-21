import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import ResponsiveLayout from '../../../../../components/ResponsiveLayout'
import { buildCustomerTemplatePreviewViewModel } from './buildCustomerTemplatePreviewViewModel'
import CustomerTemplatePreviewMobileView from './CustomerTemplatePreviewMobileView'
import CustomerTemplatePreviewPCView from './CustomerTemplatePreviewPCView'

export default function CustomerTemplatePreviewPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const viewModel = useMemo(() => buildCustomerTemplatePreviewViewModel(templateId), [templateId])

  return (
    <>
      <div className="platform-admin-page__toolbar">
        <Link to="/admin/platform/customer-templates" className="platform-admin-page__back">
          ← 고객관리 템플릿
        </Link>
      </div>
      <ResponsiveLayout
        PC={CustomerTemplatePreviewPCView}
        Mobile={CustomerTemplatePreviewMobileView}
        viewProps={viewModel}
      />
    </>
  )
}
