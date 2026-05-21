import ResponsiveLayout from '../../../components/ResponsiveLayout'
import GovernmentLoginPageMobileView from './login/GovernmentLoginPageMobileView'
import GovernmentLoginPagePCView from './login/GovernmentLoginPagePCView'
import { GOVERNMENT_LOGIN_DOCUMENT_TITLE } from '../../../config/governmentAppMeta'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'

export default function GovernmentLoginPage() {
  useDocumentTitle(GOVERNMENT_LOGIN_DOCUMENT_TITLE)
  return <ResponsiveLayout PC={GovernmentLoginPagePCView} Mobile={GovernmentLoginPageMobileView} />
}
