/**
 * 보험 contract 전자서명 모듈 → 정부지원 gov_signature 모듈 일괄 복사·치환.
 * 원본 파일은 수정하지 않는다. 생성 후 수동 보정이 필요할 수 있다.
 *
 * Usage: node server/scripts/portGovSignatureFromContracts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

/** @type {[string, string][]} — 긴 패턴 우선 */
const REPLACEMENTS = [
  ['contract_send_session_confirmation_field_values', 'gov_signature_send_session_confirmation_field_values'],
  ['contract_template_confirmation_fields', 'gov_signature_template_confirmation_fields'],
  ['contract_template_field_settings', 'gov_signature_template_field_settings'],
  ['contract_confirmation_item_values', 'gov_signature_confirmation_item_values'],
  ['contract_confirmation_items', 'gov_signature_confirmation_items'],
  ['contract_send_session_attachments', 'gov_signature_attachments'],
  ['contract_document_instances', 'gov_signature_document_instances'],
  ['contract_document_values', 'gov_signature_document_values'],
  ['contract_package_items', 'gov_signature_package_items'],
  ['contract_template_fields', 'gov_signature_template_fields'],
  ['contract_send_sessions', 'gov_signature_send_sessions'],
  ['contract_templates', 'gov_signature_templates'],
  ['contract_packages', 'gov_signature_packages'],
  ['identity_verification_sessions', 'gov_signature_identity_sessions'],
  ['signature_evidences', 'gov_signature_evidences'],
  ['contractPublicOtpApi', 'governmentSignaturePublicOtpApi'],
  ['contractPublicApi', 'governmentSignaturePublicApi'],
  ['contractAdminApi', 'governmentSignatureTemplateApi'],
  ['contractUserApi', 'governmentSignatureUserApi'],
  ['contractSignatureTestConsoleClient', 'governmentSignatureTemplateClient'],
  ['contractSignatureHistoryClient', 'governmentSignatureHistoryClient'],
  ['contractSignatureSendClient', 'governmentSignatureSendClient'],
  ['contractTemplateConfirmationFieldsClient', 'governmentSignatureTemplateConfirmationFieldsClient'],
  ['contractPublicClient', 'governmentSignaturePublicClient'],
  ['ContractSignatureTestConsolePage', 'GovernmentSignatureTemplatesPage'],
  ['ContractSignatureHistoryPage', 'GovernmentSignatureHistoryPage'],
  ['ContractSignatureSendPage', 'GovernmentSignatureSendPage'],
  ['ContractSignatureUserSendRoute', 'GovernmentSignatureUserSendRoute'],
  ['ContractSignatureTestRoute', 'GovernmentSignatureTemplateRoute'],
  ['ContractSignDocumentPage', 'GovernmentSignDocumentPage'],
  ['ContractSignPage', 'GovernmentSignPage'],
  ['ContractAttachmentReviewModal', 'GovernmentSignatureAttachmentReviewModal'],
  ['ContractTemplatePanel', 'GovernmentSignatureTemplatePanel'],
  ['ContractTemplateConfirmationFieldsSection', 'GovernmentSignatureTemplateConfirmationFieldsSection'],
  ['CustomerSelector', 'GovernmentBusinessProfileSelector'],
  ['contractSignatureTestDisplay', 'governmentSignatureTemplateDisplay'],
  ['contractSignatureTestConsoleFlags', 'governmentSignatureTemplateFlags'],
  ['contract-signature-console.css', 'government-signature-console.css'],
  ['contract-signature-send-mobile.css', 'government-signature-send-mobile.css'],
  ['contract-public-sign.css', 'government-signature-public.css'],
  ['contractSignature', 'governmentSignature'],
  ['ContractSignature', 'GovernmentSignature'],
  ['ContractSign', 'GovernmentSign'],
  ['contractPublic', 'governmentSignaturePublic'],
  ['contractTemplate', 'governmentSignatureTemplate'],
  ['ContractTemplate', 'GovernmentSignatureTemplate'],
  ['contractSend', 'governmentSignatureSend'],
  ['ContractSend', 'GovernmentSignatureSend'],
  ['contractEvidence', 'governmentSignatureEvidence'],
  ['contractConfirmation', 'governmentSignatureConfirmation'],
  ['contractStamped', 'governmentSignatureStamped'],
  ['contractSender', 'governmentSignatureSender'],
  ['contractField', 'governmentSignatureField'],
  ['contractOtp', 'governmentSignatureOtp'],
  ['contractSelfSms', 'governmentSignatureSelfSms'],
  ['getContractOtp', 'getGovernmentSignatureOtp'],
  ['CONTRACT_OTP', 'GOV_SIGNATURE_OTP'],
  ['CONTRACT_TARGET_PHONE', 'GOV_SIGNATURE_TARGET_PHONE'],
  ['contract_signature', 'gov_signature'],
  ['contract_template_not_confirmation_only', 'gov_signature_template_not_confirmation_only'],
  ['registerContractPublicOtpApi', 'registerGovernmentSignaturePublicOtpApi'],
  ['registerContractPublicApi', 'registerGovernmentSignaturePublicApi'],
  ['registerContractAdminApi', 'registerGovernmentSignatureTemplateApi'],
  ['registerContractUserApi', 'registerGovernmentSignatureUserApi'],
  ['requireContractUserSend', 'requireGovernmentProgramUserSignature'],
  ['requireContractAdminConsole', 'requireGovernmentProgramUserSignature'],
  ['assertContractTemplateAccess', 'assertGovSignatureTemplateAccess'],
  ['assertConfirmationOnlyTemplateRow', 'assertGovConfirmationOnlyTemplateRow'],
  ['reconcileContractFieldSettingsAfterPdfSave', 'reconcileGovSignatureFieldSettingsAfterPdfSave'],
  ['seedContractTemplateFieldSettings', 'seedGovSignatureTemplateFieldSettings'],
  ['normalizeContractFieldInputRole', 'normalizeGovSignatureFieldInputRole'],
  ['effectiveContractFieldRole', 'effectiveGovSignatureFieldRole'],
  ['assertContractFieldSettingsValidForActivate', 'assertGovSignatureFieldSettingsValidForActivate'],
  ['listSenderFieldsForContractTemplate', 'listSenderFieldsForGovSignatureTemplate'],
  ['insertSenderPrefillDocumentValues', 'insertGovSenderPrefillDocumentValues'],
  ['senderValuesByContractTemplates', 'senderValuesByGovSignatureTemplates'],
  ['getCustomerForPdfMapping', 'getGovProfileForPdfMapping'],
  ['customer_mapping', 'profile_mapping'],
  ['customerMapping', 'profileMapping'],
  ['CustomerMapping', 'ProfileMapping'],
  ['searchCustomersForContractSend', 'searchProfilesForGovernmentSignatureSend'],
  ['getContractCustomerSearchValidationMessage', 'getGovSignatureProfileSearchValidationMessage'],
  ['UserContractCustomerSearchHit', 'GovSignatureProfileSearchHit'],
  ['UserContractTemplateItem', 'GovSignatureTemplateItem'],
  ['UserContractConfirmationFieldRow', 'GovSignatureConfirmationFieldRow'],
  ['createUserContractSendSession', 'createGovernmentSignatureSendSession'],
  ['listUserContractTemplates', 'listGovernmentSignatureTemplates'],
  ['listUserContractTemplateConfirmationFields', 'listGovernmentSignatureTemplateConfirmationFields'],
  ['uploadUserContractSendAttachment', 'uploadGovernmentSignatureSendAttachment'],
  ['getUserContractSendSessionDetail', 'getGovernmentSignatureSendSessionDetail'],
  ['buildCustomerPublicSignUrl', 'buildGovSignaturePublicSignUrl'],
  ['createContractTemplateFromPdfTemplate', 'createGovSignatureTemplateFromPdfTemplate'],
  ['listContractTemplates', 'listGovSignatureTemplates'],
  ['listPdfTemplatesForContractTest', 'listPdfTemplatesForGovSignature'],
  ['getPdfTemplateDetailForContractTest', 'getPdfTemplateDetailForGovSignature'],
  ['/contracts/signatures/send', '/government/signatures/send'],
  ['/contracts/signatures/history', '/government/signatures'],
  ['/contracts/sign/', '/government/sign/'],
  ['/admin/contract-signatures', '/government/signature-templates'],
  ['/admin/pdf-templates', '/government/signature-templates/pdf'],
  ['/api/contracts/public/', '/api/government-support/public/signatures/'],
  ['/api/contracts/', '/api/government-support/signatures/'],
  ['/api/admin/contracts/', '/api/government-support/signature-templates/'],
  ['contracts/send-attachments/', 'government/signatures/send-attachments/'],
  ['contracts/', 'government/signatures/sessions/'],
  ['link_code', 'sign_token'],
  ['linkCode', 'signToken'],
  ['LinkCode', 'SignToken'],
  [':linkCode', ':token'],
  ['customer_id', 'profile_id'],
  ['customerId', 'profileId'],
  ['customer_phone_raw', 'profile_phone_raw'],
  ['customer_phone', 'profile_phone'],
  ['customer_name', 'profile_display_name'],
  ['customerName', 'profileDisplayName'],
  ['customers c ON c.id', 'gov_support_profiles p ON p.id'],
  ['customers c', 'gov_support_profiles p'],
  ['FROM customers', 'FROM gov_support_profiles'],
  ['JOIN customers', 'JOIN gov_support_profiles'],
  ['c.phone', 'p.phone'],
  ['c.ga_id', 'p.tenant_id'],
  ['c.user_id', 'p.owner_user_id'],
  ['ga_id = $', 'owner_user_id = $'],
  ['t.ga_id', 't.owner_user_id'],
  ['ga_id', 'owner_user_id'],
  ['gaId', 'ownerUserId'],
  ['parseGaId', 'parseGovOwnerUserId'],
  ['userGa', 'ownerUserId'],
  ['effectiveGa', 'ownerUserId'],
  ['resolveEffectiveGaId', 'resolveGovSignatureOwnerUserId'],
  ['CT_PREFIX', 'GST_PREFIX'],
  ['CTF_PREFIX', 'GSTF_PREFIX'],
  ['CTCF_PREFIX', 'GSTCF_PREFIX'],
  ['PKG_PREFIX', 'GSPKG_PREFIX'],
  ['CSS_PREFIX', 'GSS_PREFIX'],
  ['CDI_PREFIX', 'GSDI_PREFIX'],
  ["'ct_'", "'gst_'"],
  ["'css_'", "'gss_'"],
  ["'cdi_'", "'gsdi_'"],
  ["'ctcf_'", "'gstcf_'"],
  ["'ctf_'", "'gstf_'"],
  ["'pkg_'", "'gspkg_'"],
  ["'ids_'", "'govids_'"],
  ['CTCF_PREFIX', 'GSTCF_PREFIX'],
  ['../services/contract', '../services/governmentSignature'],
  ['./contract', './governmentSignature'],
  ["from './contract", "from './governmentSignature"],
  ["from '../services/contract", "from '../services/governmentSignature"],
  ['features/contracts/', 'features/government-support/signatures/'],
  ['../testConsole/', '../signatureTemplates/'],
  ['../../testConsole/', '../../signatureTemplates/'],
  ['../userHistory/', '../signatures/'],
  ['../userSend/', '../signatures/'],
  ['../public/', '../publicSignature/'],
]

function applyReplacements(content) {
  let out = content
  for (const [from, to] of REPLACEMENTS) {
    out = out.split(from).join(to)
  }
  return out
}

function copyTransform(srcRel, destRel) {
  const src = path.join(ROOT, srcRel)
  const dest = path.join(ROOT, destRel)
  if (!fs.existsSync(src)) {
    console.warn('SKIP missing:', srcRel)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const raw = fs.readFileSync(src, 'utf8')
  fs.writeFileSync(dest, applyReplacements(raw), 'utf8')
  console.log('OK', destRel)
}

const SERVICE_MAP = [
  ['server/services/contractConfirmationItems.js', 'server/services/governmentSignatureConfirmationItems.js'],
  ['server/services/contractConfirmationOnlyEvidence.js', 'server/services/governmentSignatureConfirmationOnlyEvidence.js'],
  ['server/services/contractConfirmationPdfFromInstance.js', 'server/services/governmentSignatureConfirmationPdfFromInstance.js'],
  ['server/services/contractEvidencePdfService.js', 'server/services/governmentSignatureEvidencePdfService.js'],
  ['server/services/contractEvidenceService.js', 'server/services/governmentSignatureEvidenceService.js'],
  ['server/services/contractFieldValueNormalize.js', 'server/services/governmentSignatureFieldValueNormalize.js'],
  ['server/services/contractOtpService.js', 'server/services/governmentSignatureOtpService.js'],
  ['server/services/contractSendAttachments.js', 'server/services/governmentSignatureSendAttachments.js'],
  ['server/services/contractSenderPrefill.js', 'server/services/governmentSignatureSenderPrefill.js'],
  ['server/services/contractSendSessionConfirmationFieldValues.js', 'server/services/governmentSignatureSendSessionConfirmationFieldValues.js'],
  ['server/services/contractStampedPdfFromInstance.js', 'server/services/governmentSignatureStampedPdfFromInstance.js'],
  ['server/services/contractTemplateFieldSettings.js', 'server/services/governmentSignatureTemplateFieldSettings.js'],
]

const API_MAP = [
  ['server/apis/contractAdminApi.js', 'server/apis/governmentSignatureTemplateApi.js'],
  ['server/apis/contractUserApi.js', 'server/apis/governmentSignatureUserApi.js'],
  ['server/apis/contractPublicApi.js', 'server/apis/governmentSignaturePublicApi.js'],
  ['server/apis/contractPublicOtpApi.js', 'server/apis/governmentSignaturePublicOtpApi.js'],
]

const FRONTEND_MAP = [
  ['src/features/contracts/public/ContractSignPage.tsx', 'src/features/government-support/publicSignature/GovernmentSignPage.tsx'],
  ['src/features/contracts/public/ContractSignDocumentPage.tsx', 'src/features/government-support/publicSignature/GovernmentSignDocumentPage.tsx'],
  ['src/features/contracts/public/contractPublicClient.ts', 'src/features/government-support/publicSignature/governmentSignaturePublicClient.ts'],
  ['src/features/contracts/public/contract-public-sign.css', 'src/features/government-support/publicSignature/government-signature-public.css'],
  ['src/features/contracts/public/components/PublicPdfPreviewModal.tsx', 'src/features/government-support/publicSignature/components/PublicPdfPreviewModal.tsx'],
  ['src/features/contracts/public/components/ContractAttachmentReviewModal.tsx', 'src/features/government-support/publicSignature/components/GovernmentSignatureAttachmentReviewModal.tsx'],
  ['src/features/contracts/userSend/ContractSignatureSendPage.tsx', 'src/features/government-support/signatures/GovernmentSignatureSendPage.tsx'],
  ['src/features/contracts/userSend/ContractSignatureUserSendRoute.tsx', 'src/features/government-support/signatures/GovernmentSignatureUserSendRoute.tsx'],
  ['src/features/contracts/userSend/contractSignatureSendClient.ts', 'src/features/government-support/signatures/governmentSignatureSendClient.ts'],
  ['src/features/contracts/userSend/contract-signature-send-mobile.css', 'src/features/government-support/signatures/government-signature-send-mobile.css'],
  ['src/features/contracts/userSend/SendAttachmentFileInput.tsx', 'src/features/government-support/signatures/SendAttachmentFileInput.tsx'],
  ['src/features/contracts/userSend/ConfirmationOnlySendFieldsSection.tsx', 'src/features/government-support/signatures/ConfirmationOnlySendFieldsSection.tsx'],
  ['src/features/contracts/userHistory/ContractSignatureHistoryPage.tsx', 'src/features/government-support/signatures/GovernmentSignatureHistoryPage.tsx'],
  ['src/features/contracts/userHistory/contractSignatureHistoryClient.ts', 'src/features/government-support/signatures/governmentSignatureHistoryClient.ts'],
  ['src/features/contracts/userHistory/sendSessionStaffDisplay.ts', 'src/features/government-support/signatures/sendSessionStaffDisplay.ts'],
  ['src/features/contracts/userHistory/components/SendSessionHistoryList.tsx', 'src/features/government-support/signatures/components/SendSessionHistoryList.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionHistoryFilters.tsx', 'src/features/government-support/signatures/components/SendSessionHistoryFilters.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionDetailPanel.tsx', 'src/features/government-support/signatures/components/SendSessionDetailPanel.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionStatusBadge.tsx', 'src/features/government-support/signatures/components/SendSessionStatusBadge.tsx'],
  ['src/features/contracts/userHistory/components/ContractTableCells.tsx', 'src/features/government-support/signatures/components/GovernmentSignatureTableCells.tsx'],
  ['src/features/contracts/testConsole/ContractSignatureTestConsolePage.tsx', 'src/features/government-support/signatureTemplates/GovernmentSignatureTemplatesPage.tsx'],
  ['src/features/contracts/testConsole/ContractSignatureTestRoute.tsx', 'src/features/government-support/signatureTemplates/GovernmentSignatureTemplateRoute.tsx'],
  ['src/features/contracts/testConsole/contractSignatureTestConsoleClient.ts', 'src/features/government-support/signatureTemplates/governmentSignatureTemplateClient.ts'],
  ['src/features/contracts/testConsole/contractSignatureTestDisplay.ts', 'src/features/government-support/signatureTemplates/governmentSignatureTemplateDisplay.ts'],
  ['src/features/contracts/testConsole/contractSignatureTestConsoleFlags.ts', 'src/features/government-support/signatureTemplates/governmentSignatureTemplateFlags.ts'],
  ['src/features/contracts/testConsole/contractTemplateConfirmationFieldsClient.ts', 'src/features/government-support/signatureTemplates/governmentSignatureTemplateConfirmationFieldsClient.ts'],
  ['src/features/contracts/testConsole/contract-signature-console.css', 'src/features/government-support/signatureTemplates/government-signature-console.css'],
  ['src/features/contracts/testConsole/components/ContractTemplatePanel.tsx', 'src/features/government-support/signatureTemplates/components/GovernmentSignatureTemplatePanel.tsx'],
  ['src/features/contracts/testConsole/components/ContractTemplateConfirmationFieldsSection.tsx', 'src/features/government-support/signatureTemplates/components/GovernmentSignatureTemplateConfirmationFieldsSection.tsx'],
  ['src/features/contracts/testConsole/components/PdfTemplateSelector.tsx', 'src/features/government-support/signatureTemplates/components/PdfTemplateSelector.tsx'],
  ['src/features/contracts/testConsole/components/CustomerSelector.tsx', 'src/features/government-support/signatureTemplates/components/GovernmentBusinessProfileSelector.tsx'],
  ['src/features/contracts/testConsole/components/SendSessionPanel.tsx', 'src/features/government-support/signatureTemplates/components/SendSessionPanel.tsx'],
  ['src/features/contracts/testConsole/components/EvidenceStatusPanel.tsx', 'src/features/government-support/signatureTemplates/components/EvidenceStatusPanel.tsx'],
]

for (const [s, d] of SERVICE_MAP) copyTransform(s, d)
for (const [s, d] of API_MAP) copyTransform(s, d)
for (const [s, d] of FRONTEND_MAP) copyTransform(s, d)

console.log('\nDone. Review generated files and fix route/API path mismatches manually.')
