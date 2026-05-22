import { Navigate, Outlet, createBrowserRouter } from 'react-router-dom'
import { AppLayout } from './AppLayout'
import { PublicHomeEntry } from './HomeRedirect'
import { ApplicationFormPage } from './features/application/pages/ApplicationFormPage'
import { ApplicationListPage } from './features/application/pages/ApplicationListPage'
import ApplicationPage from './features/application/pages/ApplicationPage'
import { ApplicationResultPage } from './features/application/pages/ApplicationResultPage'
import { DirectAutoPage } from './features/application/pages/DirectAutoPage'
import GaDelegateManagementPage from './features/admin/pages/GaDelegateManagementPage'
import InsurerManagersPage from './features/insurer-managers/pages/InsurerManagersPage'
import LossAdjustersPage from './features/loss-adjusters/pages/LossAdjustersPage'
import GaManagementPage from './features/admin/pages/GaManagementPage'
import GaCompanyManagePage from './features/admin/pages/GaCompanyManagePage'
import UserManagementPage from './features/admin/pages/UserManagementPage'
import AuditLogsPage from './features/admin/pages/AuditLogsPage'
import SubscriptionPolicyPage from './features/admin/pages/SubscriptionPolicyPage'
import SubscriptionUsersPage from './features/admin/pages/SubscriptionUsersPage'
import AdminSubscriptionSettingsPage from './features/admin/pages/AdminSubscriptionSettingsPage'
import { AccountResetPage } from './features/account/pages/AccountResetPage'
import { LoginPage } from './features/auth/pages/LoginPage'
import { PasswordResetPage } from './features/auth/pages/PasswordResetPage'
import { RegisterPage } from './features/auth/pages/RegisterPage'
import { ProfilePage } from './features/auth/pages/ProfilePage'
import { ProtectedRoute } from './features/auth/ProtectedRoute'
import { RequireActiveSubscription } from './features/subscription/RequireActiveSubscription'
import { GaCarInsuranceRoute } from './features/auth/GaCarInsuranceRoute'
import { StaffRoute } from './features/auth/StaffRoute'
import { InsurancePrintPage } from './features/contacts/pages/InsurancePrintPage'
import { InsuranceUpdatesPage } from './features/contacts/pages/InsuranceUpdatesPage'
import { ReinsurerContactsPage } from './features/contacts/pages/ReinsurerContactsPage'
import CustomerCarPage from './features/customers/pages/CustomerCarPage'
import CustomerInputPage from './features/customers/pages/CustomerInputPage'
import CustomerRegisterPage from './features/customers/pages/CustomerRegisterPage'
import CustomerConsultationsPage from './features/customers/pages/CustomerConsultationsPage'
import CustomerFilesPage from './features/customers/pages/CustomerFilesPage'
import CustomerGaExcelPage from './features/customers/pages/CustomerGaExcelPage'
import CustomerMemosPage from './features/customers/pages/CustomerMemosPage'
import CustomerWorkspaceLayout from './features/customers/pages/CustomerWorkspaceLayout'
import CustomerWorkspaceHomePage from './features/customers/pages/CustomerWorkspaceHomePage'
import CustomerAutoFormPage from './features/customers/pages/CustomerAutoFormPage'
import TeamMembersPage from './features/team/pages/TeamMembersPage'
import TeamPostsPage from './features/team/pages/TeamPostsPage'
import TeamFilesPage from './features/team/pages/TeamFilesPage'
import CompanyRegistryPage from './features/company-registry/pages/CompanyRegistryPage'
import GeneralRequestPage from './features/company-registry/pages/GeneralRequestPage'
import InsuranceCompanyContactsViewPage from './features/company-registry/pages/InsuranceCompanyContactsViewPage'
import { ConsentCompanyPage } from './features/consent/pages/ConsentCompanyPage'
import { TemplateEditorPage } from './features/consent/admin/pages/TemplateEditorPage'
import { TemplateListPage } from './features/consent/admin/pages/TemplateListPage'
import PdfTemplateListPage from './features/pdf-engine/pages/PdfTemplateListPage'
import PdfTemplateEditorPage from './features/pdf-engine/pages/PdfTemplateEditorPage'
import PdfDocumentListPage from './features/pdf-engine/pages/PdfDocumentListPage'
import PdfDocumentDetailPage from './features/pdf-engine/pages/PdfDocumentDetailPage'
import PdfIssuanceHistoryPage from './features/pdf-engine/pages/PdfIssuanceHistoryPage'
import { ConsentFormPage } from './features/consent/pages/ConsentFormPage'
import { DashboardPage } from './features/dashboard/pages/DashboardPage'
import { IntroductionPage } from './features/web/pages/IntroductionPage'
import { IntroductionInstallPage } from './features/web/pages/IntroductionInstallPage'
import FeatureRequestPage from './features/feature-request/pages/FeatureRequestPage'
import FeatureRequestsAdminPage from './features/feature-request/pages/FeatureRequestsAdminPage'
import AdminAnalyticsPage from './features/analytics/pages/AdminAnalyticsPage'
import AdminInsurerSitesPage from './features/insurer-sites/pages/AdminInsurerSitesPage'
import PlatformHubPage from './features/platform/pages/PlatformHubPage'
import IndustriesListPage from './features/platform/pages/industries/IndustriesListPage'
import IndustryDetailPage from './features/platform/pages/industries/IndustryDetailPage'
import PlatformTenantManagePage from './features/platform/pages/tenants/platform-tenant-manage/PlatformTenantManagePage'
import TenantsListPage from './features/platform/pages/tenants/TenantsListPage'
import MembershipsListPage from './features/platform/pages/memberships/MembershipsListPage'
import ExternalAccountsSummaryPage from './features/platform/pages/external-accounts/ExternalAccountsSummaryPage'
import CustomerTemplatesPage from './features/platform/pages/customer-templates/CustomerTemplatesPage'
import CustomerTemplatePreviewPage from './features/platform/pages/customer-templates/preview/CustomerTemplatePreviewPage'
import CrmCustomerManagementTemplatesListPage from './features/platform/pages/crm-templates/CrmCustomerManagementTemplatesListPage'
import CrmCustomerManagementTemplateEditorPage from './features/platform/pages/crm-templates/CrmCustomerManagementTemplateEditorPage'
import IndustryModeLandingPage from './features/platform/pages/modes/IndustryModeLandingPage'
import TenantModeLandingPage from './features/platform/pages/modes/TenantModeLandingPage'
import PlatformRegistriesPage from './features/platform/pages/registries/PlatformRegistriesPage'
import InsurerSitesPage from './features/insurer-sites/pages/InsurerSitesPage'
import PrivacyPolicyPage from './features/legal/PrivacyPolicyPage'
import { SuperAdminRoute } from './features/auth/SuperAdminRoute'
import { InsurerManagerOnlyRoute } from './features/auth/InsurerManagerOnlyRoute'
import { RequireNotInsurerManagerRoute } from './features/auth/RequireNotInsurerManagerRoute'
import { AuditLogReaderRoute } from './features/auth/AuditLogReaderRoute'
import { InsurerListPage } from './features/insurer-news/pages/InsurerListPage'
import { InsurerNewsletterListPage } from './features/insurer-news/pages/InsurerNewsletterListPage'
import { NewsletterDetailPage } from './features/insurer-news/pages/NewsletterDetailPage'
import { NewsletterHubPage } from './features/insurer-news/pages/NewsletterHubPage'
import { NewsletterPortalLayout } from './features/insurer-news/pages/NewsletterPortalLayout'
import { NewsletterRecentPage } from './features/insurer-news/pages/NewsletterRecentPage'
import { InsurerManagerNewsDetailPage } from './features/insurer-news/pages/InsurerManagerNewsDetailPage'
import { InsurerManagerNewsListPage } from './features/insurer-news/pages/InsurerManagerNewsListPage'
import { InsurerManagerNewsUploadPage } from './features/insurer-news/pages/InsurerManagerNewsUploadPage'
import { LossAdjusterManagerNewsDetailPage } from './features/insurer-news/pages/LossAdjusterManagerNewsDetailPage'
import { LossAdjusterManagerNewsListPage } from './features/insurer-news/pages/LossAdjusterManagerNewsListPage'
import { LossAdjusterManagerNewsUploadPage } from './features/insurer-news/pages/LossAdjusterManagerNewsUploadPage'
import { LossAdjusterNewsletterDetailPage } from './features/insurer-news/pages/LossAdjusterNewsletterDetailPage'
import { LossAdjusterNewsletterHubPage } from './features/insurer-news/pages/LossAdjusterNewsletterHubPage'
import { LossAdjusterNewsletterPortalLayout } from './features/insurer-news/pages/LossAdjusterNewsletterPortalLayout'
import MemoRoutePage from './features/memo/pages/MemoRoutePage'
import MyStoragePage from './features/storage/pages/MyStoragePage'
import TodosWorkspacePage from './features/todos/pages/TodosWorkspacePage'
import NotificationsPlaceholderPage from './features/todos/pages/NotificationsPlaceholderPage'
import AppWorkspaceLayout from './layouts/AppWorkspaceLayout'
import ClaimRequestsRoutePage from './features/claim-requests/pages/ClaimRequestsRoutePage'
import CustomerAppConnectPage from './features/customer-app/pages/CustomerAppConnectPage'
import CustomerAppHomePage from './features/customer-app/pages/CustomerAppHomePage'
import CustomerAppLinkOpenPage from './features/customer-app/pages/CustomerAppLinkOpenPage'
import CustomerAppRequestComposePage from './features/customer-app/pages/CustomerAppRequestComposePage'
import CustomerAppRequestsPage from './features/customer-app/pages/CustomerAppRequestsPage'
import CustomerAppRequestDetailPage from './features/customer-app/pages/CustomerAppRequestDetailPage'
import CustomerAppNewsListPage from './features/customer-app/pages/CustomerAppNewsListPage'
import CustomerAppNewsDetailPage from './features/customer-app/pages/CustomerAppNewsDetailPage'
import CustomerAppProfilePage from './features/customer-app/pages/CustomerAppProfilePage'
import CustomerAppMainLayout from './features/customer-app/components/CustomerAppMainLayout'
import ContractSignPage from './features/contracts/public/ContractSignPage'
import ContractSignDocumentPage from './features/contracts/public/ContractSignDocumentPage'
import { ContractSignatureTestRoute } from './features/contracts/testConsole/ContractSignatureTestRoute'
import ContractSignatureTestConsolePage from './features/contracts/testConsole/ContractSignatureTestConsolePage'
import { ContractSignatureUserSendRoute } from './features/contracts/userSend/ContractSignatureUserSendRoute'
import ContractSignatureSendPage from './features/contracts/userSend/ContractSignatureSendPage'
import ContractSignatureHistoryPage from './features/contracts/userHistory/ContractSignatureHistoryPage'
import LiquorSignPage from './features/liquor/publicSignature/LiquorSignPage'
import LiquorSignDocumentPage from './features/liquor/publicSignature/LiquorSignDocumentPage'
import { LiquorSignatureUserSendRoute } from './features/liquor/signatures/LiquorSignatureUserSendRoute'
import LiquorSignatureSendPage from './features/liquor/signatures/LiquorSignatureSendPage'
import LiquorSignatureHistoryPage from './features/liquor/signatures/LiquorSignatureHistoryPage'
import { LiquorSignatureTemplateRoute } from './features/liquor/signatureTemplates/LiquorSignatureTemplateRoute'
import LiquorSignatureTemplatesPage from './features/liquor/signatureTemplates/LiquorSignatureTemplatesPage'
import { LiquorTenantSettingsRoute } from './features/liquor/settings/LiquorTenantSettingsRoute'
import LiquorTenantCompanyProfilePage from './features/liquor/settings/LiquorTenantCompanyProfilePage'
import { LiquorReceivablesRoute } from './features/liquor/receivables/LiquorReceivablesRoute'
import LiquorReceivablesPage from './features/liquor/receivables/LiquorReceivablesPage'
import GovernmentLoginPage from './features/government-support/pages/GovernmentLoginPage'
import GovernmentSignupPage from './features/government-support/pages/GovernmentSignupPage'
import GovernmentJoinPage from './features/government-support/pages/GovernmentJoinPage'
import GovernmentUserLayout from './features/government-support/layouts/GovernmentUserLayout'
import GovernmentUserHomePage from './features/government-support/pages/user/GovernmentUserHomePage'
import GovernmentUserBusinessesPage from './features/government-support/pages/user/GovernmentUserBusinessesPage'
import GovernmentProfileWorkspaceLayout from './features/government-support/pages/workspace/GovernmentProfileWorkspaceLayout'
import GovernmentProfileWorkspaceHomePage from './features/government-support/pages/workspace/GovernmentProfileWorkspaceHomePage'
import GovernmentProfileWorkspaceTabPage from './features/government-support/pages/workspace/GovernmentProfileWorkspaceTabPage'
import GovernmentUserMePage from './features/government-support/pages/user/GovernmentUserMePage'
import GovernmentAdminLayout from './features/government-support/layouts/GovernmentAdminLayout'
import GovernmentAdminDashboardPage from './features/government-support/pages/admin/GovernmentAdminDashboardPage'
import GovernmentAdminAgenciesPage from './features/government-support/pages/admin/GovernmentAdminAgenciesPage'
import GovernmentAdminUsersPage from './features/government-support/pages/admin/GovernmentAdminUsersPage'
import GovernmentAdminProgramUsersPage from './features/government-support/pages/admin/GovernmentAdminProgramUsersPage'
import GovernmentAdminProgramUserDetailPage from './features/government-support/pages/admin/GovernmentAdminProgramUserDetailPage'
import GovernmentAdminNoticesPage from './features/government-support/pages/admin/GovernmentAdminNoticesPage'
import GovernmentAdminResourcesPage from './features/government-support/pages/admin/GovernmentAdminResourcesPage'
import GovernmentUserNoticesPage from './features/government-support/pages/GovernmentUserNoticesPage'
import GovernmentUserResourcesPage from './features/government-support/pages/GovernmentUserResourcesPage'
import GovernmentPlaceholderPage from './features/government-support/components/GovernmentPlaceholderPage'
import GovernmentProtectedRoute from './features/government-support/routes/GovernmentProtectedRoute'
import GovernmentSignPage from './features/government-support/publicSignature/GovernmentSignPage'
import GovernmentSignDocumentPage from './features/government-support/publicSignature/GovernmentSignDocumentPage'
import { GovernmentSignatureUserSendRoute } from './features/government-support/signatures/GovernmentSignatureUserSendRoute'
import GovernmentSignatureSendPage from './features/government-support/signatures/GovernmentSignatureSendPage'
import GovernmentSignatureHistoryPage from './features/government-support/signatures/GovernmentSignatureHistoryPage'
import { GovernmentSignatureTemplateRoute } from './features/government-support/signatureTemplates/GovernmentSignatureTemplateRoute'
import GovernmentSignatureTemplatesPage from './features/government-support/signatureTemplates/GovernmentSignatureTemplatesPage'

export const appRouter = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <PublicHomeEntry /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage signupIndustry="insurance" /> },
      { path: 'password-reset', element: <PasswordResetPage /> },
      { path: 'signup', element: <Navigate to="/signup/insurance" replace /> },
      { path: 'signup/insurance', element: <RegisterPage signupIndustry="insurance" /> },
      { path: 'signup/gym', element: <RegisterPage signupIndustry="gym" /> },
      { path: 'signup/liquor', element: <RegisterPage signupIndustry="liquor" /> },
      { path: 'signup/government', element: <RegisterPage signupIndustry="government" /> },
      { path: 'government/login', element: <GovernmentLoginPage /> },
      { path: 'government/signup', element: <GovernmentSignupPage /> },
      { path: 'government/join', element: <GovernmentJoinPage /> },
      { path: 'government/join/:agencyCode', element: <GovernmentJoinPage /> },
      {
        element: <GovernmentProtectedRoute requireProgramUserWorkspace />,
        children: [
          {
            element: <GovernmentUserLayout />,
            children: [
              { path: 'government/workspace', element: <GovernmentUserHomePage /> },
              { path: 'government/my-businesses', element: <GovernmentUserBusinessesPage /> },
              {
                path: 'government/my-applications',
                element: <GovernmentProfileWorkspaceLayout />,
                children: [
                  { index: true, element: <GovernmentProfileWorkspaceHomePage /> },
                  { path: ':profileId/:tab', element: <GovernmentProfileWorkspaceTabPage /> },
                ],
              },
              {
                element: <GovernmentSignatureUserSendRoute />,
                children: [
                  { path: 'government/signatures', element: <GovernmentSignatureHistoryPage /> },
                  { path: 'government/signatures/send', element: <GovernmentSignatureSendPage /> },
                  { path: 'government/signatures/:id', element: <GovernmentSignatureHistoryPage /> },
                ],
              },
              {
                element: <GovernmentSignatureTemplateRoute />,
                children: [
                  { path: 'government/signature-templates', element: <GovernmentSignatureTemplatesPage /> },
                  { path: 'government/signature-templates/new', element: <GovernmentSignatureTemplatesPage /> },
                  { path: 'government/signature-templates/:id/edit', element: <GovernmentSignatureTemplatesPage /> },
                ],
              },
              { path: 'government/notices', element: <GovernmentUserNoticesPage /> },
              { path: 'government/resources', element: <GovernmentUserResourcesPage /> },
              { path: 'government/me', element: <GovernmentUserMePage /> },
            ],
          },
          { path: 'government/customers', element: <Navigate to="/government/my-applications" replace /> },
          { path: 'government/settings', element: <Navigate to="/government/me" replace /> },
        ],
      },
      {
        element: <GovernmentProtectedRoute requireAdmin />,
        children: [
          {
            element: <GovernmentAdminLayout />,
            children: [
              { path: 'government/admin', element: <GovernmentAdminDashboardPage /> },
              { path: 'government/admin/agencies', element: <GovernmentAdminAgenciesPage /> },
              {
                path: 'government/admin/profiles',
                element: <Navigate to="/government/admin/program-users" replace />,
              },
              {
                path: 'government/admin/memberships',
                element: <Navigate to="/government/admin" replace />,
              },
              {
                path: 'government/admin/settings',
                element: (
                  <GovernmentPlaceholderPage
                    title="설정"
                    description="정부지원 CRM 설정 (준비 중)"
                    backTo="/government/admin"
                  />
                ),
              },
              {
                path: 'government/admin/templates',
                element: (
                  <GovernmentPlaceholderPage
                    title="고객관리 템플릿"
                    description="government-support는 코드형 CRM입니다. 동적 빌더 템플릿은 보험 플랫폼과 별도입니다."
                    backTo="/government/admin"
                  />
                ),
              },
              {
                path: 'government/admin/pdf-templates',
                element: (
                  <GovernmentPlaceholderPage
                    title="PDF 좌표 템플릿"
                    description="기존 PDF 엔진 템플릿을 government 필드 매핑과 함께 사용합니다."
                    backTo="/government/admin"
                  />
                ),
              },
            ],
          },
        ],
      },
      {
        element: <GovernmentProtectedRoute requireOperational />,
        children: [
          {
            element: <GovernmentAdminLayout />,
            children: [
              { path: 'government/admin/notices', element: <GovernmentAdminNoticesPage /> },
              { path: 'government/admin/resources', element: <GovernmentAdminResourcesPage /> },
            ],
          },
        ],
      },
      {
        element: <GovernmentProtectedRoute requireUserManager />,
        children: [
          {
            element: <GovernmentAdminLayout />,
            children: [
              { path: 'government/admin/users', element: <GovernmentAdminUsersPage /> },
              { path: 'government/admin/program-users', element: <GovernmentAdminProgramUsersPage /> },
              {
                path: 'government/admin/program-users/:userId',
                element: <GovernmentAdminProgramUserDetailPage />,
              },
            ],
          },
        ],
      },
      { path: 'privacy', element: <PrivacyPolicyPage /> },
      { path: 'privacy-policy', element: <Navigate to="/privacy" replace /> },
      { path: 'introduction', element: <IntroductionPage /> },
      { path: 'introduction/install', element: <IntroductionInstallPage /> },
      /* 외부 고객 입력(소개 링크) — 비로그인 유지. API는 /api/customer/external-create + ref·ga 검증 */
      { path: 'customer/input', element: <CustomerInputPage /> },
      { path: 'customer/register', element: <CustomerRegisterPage /> },
      { path: 'contracts/sign/:linkCode', element: <ContractSignPage /> },
      {
        path: 'contracts/sign/:linkCode/documents/:documentInstanceId',
        element: <ContractSignDocumentPage />,
      },
      { path: 'liquor/sign/:linkCode', element: <LiquorSignPage /> },
      {
        path: 'liquor/sign/:linkCode/documents/:documentInstanceId',
        element: <LiquorSignDocumentPage />,
      },
      { path: 'government/sign/:token', element: <GovernmentSignPage /> },
      {
        path: 'government/sign/:token/documents/:documentInstanceId',
        element: <GovernmentSignDocumentPage />,
      },
      {
        path: 'customer-app',
        element: <Outlet />,
        children: [
          { index: true, element: <CustomerAppConnectPage /> },
          { path: 'link', element: <CustomerAppLinkOpenPage /> },
          { path: 'connect/:linkCode', element: <CustomerAppConnectPage /> },
          {
            element: <CustomerAppMainLayout />,
            children: [
              { path: 'home', element: <CustomerAppHomePage />, handle: { customerAppMainLabel: '홈' } },
              { path: 'profile', element: <CustomerAppProfilePage />, handle: { customerAppMainLabel: '내정보' } },
              {
                path: 'requests/new',
                element: <CustomerAppRequestComposePage />,
                handle: { customerAppMainLabel: '청구 요청 작성' },
              },
              { path: 'requests', element: <CustomerAppRequestsPage />, handle: { customerAppMainLabel: '문의내역' } },
              {
                path: 'requests/:requestId',
                element: <CustomerAppRequestDetailPage />,
                handle: { customerAppMainLabel: '청구 상세' },
              },
              { path: 'news', element: <Navigate to="/customer-app/news/all" replace /> },
              {
                path: 'news/all',
                element: <CustomerAppNewsListPage />,
                handle: { customerAppMainLabel: '전체소식지' },
              },
              {
                path: 'news/personal',
                element: <CustomerAppNewsListPage />,
                handle: { customerAppMainLabel: '개인소식지' },
              },
              {
                path: 'news/:newsId',
                element: <CustomerAppNewsDetailPage />,
                handle: { customerAppMainLabel: '소식지 상세' },
              },
            ],
          },
        ],
      },
      { path: 'portal/insurer-news', element: <Navigate to="/insurer/news" replace /> },
      { path: 'portal/insurer-news/*', element: <Navigate to="/insurer/news" replace /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <RequireActiveSubscription />,
            children: [
              {
                element: <AppWorkspaceLayout />,
                children: [
          { path: 'dashboard', element: <DashboardPage /> },
          { path: 'contacts/manage', element: <Navigate to="/insurance/company-registry" replace /> },
          { path: 'updates', element: <Navigate to="/insurance/history" replace /> },
          {
            element: <InsurerManagerOnlyRoute allowedRoles={['INSURER_MANAGER']} />,
            children: [
              { path: 'insurer/news', element: <InsurerManagerNewsListPage /> },
              { path: 'insurer/news/upload', element: <InsurerManagerNewsUploadPage /> },
              { path: 'insurer/news/:newsletterId', element: <InsurerManagerNewsDetailPage /> },
            ],
          },
          {
            element: <InsurerManagerOnlyRoute allowedRoles={['LOSS_ADJUSTER']} />,
            children: [
              { path: 'adjuster/news', element: <LossAdjusterManagerNewsListPage /> },
              { path: 'adjuster/news/upload', element: <LossAdjusterManagerNewsUploadPage /> },
              { path: 'adjuster/news/:newsletterId', element: <LossAdjusterManagerNewsDetailPage /> },
            ],
          },
          { path: 'insurance/insurer-sites', element: <InsurerSitesPage /> },
          {
            element: <RequireNotInsurerManagerRoute />,
            children: [
              { path: 'insurance/company-registry', element: <CompanyRegistryPage /> },
              { path: 'insurance/history', element: <InsuranceUpdatesPage /> },
              { path: 'internal/consent', element: <ConsentCompanyPage /> },
              { path: 'internal/consent/form', element: <ConsentFormPage /> },
              {
                path: 'portal/newsletters',
                element: <NewsletterPortalLayout />,
                children: [
                  { index: true, element: <NewsletterHubPage /> },
                  { path: 'recent', element: <NewsletterRecentPage /> },
                  { path: 'insurers', element: <InsurerListPage /> },
                  { path: 'insurers/:insurerSlug', element: <InsurerNewsletterListPage /> },
                  { path: ':newsletterId', element: <NewsletterDetailPage /> },
                ],
              },
              {
                path: 'portal/adjuster-news',
                element: <LossAdjusterNewsletterPortalLayout />,
                children: [
                  { index: true, element: <LossAdjusterNewsletterHubPage /> },
                  { path: 'recent', element: <LossAdjusterNewsletterHubPage /> },
                  { path: ':newsletterId', element: <LossAdjusterNewsletterDetailPage /> },
                ],
              },
              {
                element: <GaCarInsuranceRoute />,
                children: [
                  { path: 'application', element: <ApplicationPage /> },
                  { path: 'app/auto-insurance', element: <ApplicationFormPage /> },
                  { path: 'application/direct-auto', element: <DirectAutoPage /> },
                  { path: 'application/write', element: <ApplicationFormPage /> },
                  { path: 'my-forms', element: <ApplicationListPage /> },
                  { path: 'form/create', element: <ApplicationFormPage /> },
                  { path: 'form/:id/edit', element: <ApplicationFormPage /> },
                  { path: 'form/result/:id', element: <ApplicationResultPage /> },
                ],
              },
              /*
               * 좌표 기반 PDF 자동화 — 차보험 토글과 무관한 공용 문서 기능이므로
               * GaCarInsuranceRoute 게이트 밖에 둔다.
               * 권한/활성 여부는 서버(GET /pdf-templates · /pdf-templates/:id · /render)에서
               * GA 범위 + 구독 상태로 이중 차단한다.
               */
              { path: 'application/documents', element: <PdfDocumentListPage /> },
              { path: 'application/documents/history', element: <PdfIssuanceHistoryPage /> },
              { path: 'application/documents/:id', element: <PdfDocumentDetailPage /> },
              {
                path: 'customers',
                element: <CustomerWorkspaceLayout />,
                children: [
                  { index: true, element: <CustomerWorkspaceHomePage /> },
                  { path: ':customerId/files', element: <CustomerFilesPage /> },
                  { path: ':customerId/consultations', element: <CustomerConsultationsPage /> },
                  { path: ':customerId/ga-excel', element: <CustomerGaExcelPage /> },
                  { path: ':customerId/memos', element: <CustomerMemosPage /> },
                  { path: ':customerId/auto-form', element: <CustomerAutoFormPage /> },
                  { path: ':customerId/application-documents', element: <PdfDocumentListPage /> },
                  {
                    path: ':customerId/application-documents/history',
                    element: <PdfIssuanceHistoryPage />,
                  },
                  { path: ':customerId/application-documents/:id', element: <PdfDocumentDetailPage /> },
                  { path: ':customerId/claim-requests', element: <ClaimRequestsRoutePage /> },
                ],
              },
              { path: 'storage', element: <MyStoragePage /> },
              { path: 'todos', element: <TodosWorkspacePage /> },
              { path: 'notifications', element: <NotificationsPlaceholderPage /> },
              { path: 'team/members', element: <TeamMembersPage /> },
              { path: 'team/manage', element: <Navigate to="/team/members" replace /> },
              { path: 'team/menu-settings', element: <Navigate to="/team/members" replace /> },
              { path: 'team/admin', element: <Navigate to="/team/members" replace /> },
              { path: 'team/posts', element: <TeamPostsPage /> },
              { path: 'team/files', element: <TeamFilesPage /> },
              { path: 'memo', element: <MemoRoutePage /> },
              { path: 'insurer-managers', element: <InsurerManagersPage /> },
              { path: 'loss-adjusters', element: <LossAdjustersPage /> },
              { path: 'customer-car', element: <CustomerCarPage /> },
              { path: 'admin/ga', element: <GaManagementPage /> },
              { path: 'admin/ga/:gaId', element: <GaCompanyManagePage /> },
              { path: 'admin/create-ga', element: <Navigate to="/admin/ga" replace /> },
              { path: 'admin/delegates', element: <GaDelegateManagementPage /> },
              { path: 'admin/create-staff', element: <Navigate to="/admin/delegates" replace /> },
              { path: 'admin/users', element: <UserManagementPage /> },
              {
                element: <SuperAdminRoute />,
                children: [
                  { path: 'admin/subscription/policy', element: <SubscriptionPolicyPage /> },
                  { path: 'admin/subscription/users', element: <SubscriptionUsersPage /> },
                  { path: 'admin/subscription/settings', element: <AdminSubscriptionSettingsPage /> },
                  { path: 'admin/platform', element: <PlatformHubPage /> },
                  { path: 'admin/platform/industries', element: <IndustriesListPage /> },
                  { path: 'admin/platform/industries/:industryId', element: <IndustryDetailPage /> },
                  { path: 'admin/platform/tenants', element: <TenantsListPage /> },
                  {
                    path: 'admin/platform/tenants/:tenantId',
                    element: <PlatformTenantManagePage />,
                  },
                  { path: 'admin/platform/memberships', element: <MembershipsListPage /> },
                  {
                    path: 'admin/platform/external-accounts',
                    element: <ExternalAccountsSummaryPage />,
                  },
                  {
                    path: 'admin/platform/crm-customer-management-templates/new',
                    element: <CrmCustomerManagementTemplateEditorPage />,
                  },
                  {
                    path: 'admin/platform/crm-customer-management-templates/:id/edit',
                    element: <CrmCustomerManagementTemplateEditorPage />,
                  },
                  {
                    path: 'admin/platform/crm-customer-management-templates',
                    element: <CrmCustomerManagementTemplatesListPage />,
                  },
                  {
                    path: 'admin/platform/customer-templates/:templateId/preview',
                    element: <CustomerTemplatePreviewPage />,
                  },
                  {
                    path: 'admin/platform/customer-templates',
                    element: <CustomerTemplatesPage />,
                  },
                  {
                    path: 'admin/platform/registries',
                    element: <PlatformRegistriesPage />,
                  },
                ],
              },
              { path: 'admin/industry/:industryId', element: <IndustryModeLandingPage /> },
              { path: 'admin/tenant/:tenantId', element: <TenantModeLandingPage /> },
              {
                element: <AuditLogReaderRoute />,
                children: [{ path: 'admin/audit-logs', element: <AuditLogsPage /> }],
              },
              { path: 'profile', element: <ProfilePage /> },
              { path: 'account/reset', element: <AccountResetPage /> },
              { path: 'feature-request', element: <FeatureRequestPage /> },
              { path: 'claim-requests', element: <ClaimRequestsRoutePage /> },
              { path: 'feature-requests/my', element: <Navigate to="/feature-request" replace /> },
              {
                element: <SuperAdminRoute />,
                children: [
                  {
                    path: 'internal/admin/feature-requests',
                    element: <FeatureRequestsAdminPage />,
                  },
                  {
                    path: 'admin/analytics',
                    element: <AdminAnalyticsPage />,
                  },
                  { path: 'admin/insurer-sites', element: <AdminInsurerSitesPage /> },
                ],
              },
              {
                element: <StaffRoute />,
                children: [
                  { path: 'internal/admin/consent-template', element: <TemplateListPage /> },
                  { path: 'internal/admin/consent-template/edit', element: <TemplateEditorPage /> },
                  { path: 'internal/admin/consent-template/edit/:id', element: <TemplateEditorPage /> },
                ],
              },
              {
                /* PDF 좌표 기반 문서 자동화 — SUPER_ADMIN 전용.
                   권한 게이트는 서버 라우터에서도 이중으로 확인한다. */
                element: <SuperAdminRoute />,
                children: [
                  { path: 'admin/pdf-templates', element: <PdfTemplateListPage /> },
                  { path: 'admin/pdf-templates/new', element: <PdfTemplateEditorPage /> },
                  { path: 'admin/pdf-templates/:id', element: <PdfTemplateEditorPage /> },
                ],
              },
              {
                element: <LiquorReceivablesRoute />,
                children: [{ path: 'liquor/receivables', element: <LiquorReceivablesPage /> }],
              },
              {
                element: <LiquorTenantSettingsRoute />,
                children: [
                  { path: 'liquor/settings/company-profile', element: <LiquorTenantCompanyProfilePage /> },
                ],
              },
              {
                element: <LiquorSignatureUserSendRoute />,
                children: [
                  { path: 'liquor/signatures/send', element: <LiquorSignatureSendPage /> },
                  { path: 'liquor/signatures/history', element: <LiquorSignatureHistoryPage /> },
                ],
              },
              {
                element: <LiquorSignatureTemplateRoute />,
                children: [
                  { path: 'liquor/signature-templates', element: <LiquorSignatureTemplatesPage /> },
                  { path: 'liquor/signature-templates/new', element: <LiquorSignatureTemplatesPage /> },
                  { path: 'liquor/signature-templates/:id/edit', element: <LiquorSignatureTemplatesPage /> },
                ],
              },
              {
                element: <ContractSignatureUserSendRoute />,
                children: [
                  { path: 'contracts/signatures/send', element: <ContractSignatureSendPage /> },
                  { path: 'contracts/signatures/history', element: <ContractSignatureHistoryPage /> },
                ],
              },
              {
                element: <ContractSignatureTestRoute />,
                children: [
                  {
                    path: 'admin/contract-signatures',
                    element: <ContractSignatureTestConsolePage />,
                  },
                  {
                    path: 'admin/contract-signature-test',
                    element: <ContractSignatureTestConsolePage />,
                  },
                ],
              },
              { path: 'contacts', element: <Navigate to="/insurance/contacts" replace /> },
              { path: 'insurance/contacts', element: <InsuranceCompanyContactsViewPage /> },
              { path: 'insurance/general-request', element: <GeneralRequestPage /> },
              { path: 'reinsurer-contacts', element: <ReinsurerContactsPage /> },
              { path: 'insurance/print', element: <InsurancePrintPage /> },
                ],
              },
            ],
          },
          { path: '*', element: <Navigate to="/dashboard" replace /> },
            ],
          },
        ],
      },
    ],
  },
])
