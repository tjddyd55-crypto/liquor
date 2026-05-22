/**
 * 보험 contract 전자서명 → 주류회사 liquor_signature 모듈 복사·치환.
 * customers + ga_id 모델 유지(정부 gov_support_profiles 변환 없음).
 *
 * Usage: node server/scripts/portLiquorSignatureFromContracts.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

/** @type {[string, string][]} — 긴 패턴 우선 */
const REPLACEMENTS = [
  ['contract_send_session_confirmation_field_values', 'liquor_signature_send_session_confirmation_field_values'],
  ['contract_template_confirmation_fields', 'liquor_signature_template_confirmation_fields'],
  ['contract_template_field_settings', 'liquor_signature_template_field_settings'],
  ['contract_confirmation_item_values', 'liquor_signature_confirmation_item_values'],
  ['contract_confirmation_items', 'liquor_signature_confirmation_items'],
  ['contract_send_session_attachments', 'liquor_signature_send_session_attachments'],
  ['contract_document_instances', 'liquor_signature_document_instances'],
  ['contract_document_values', 'liquor_signature_document_values'],
  ['contract_package_items', 'liquor_signature_package_items'],
  ['contract_template_fields', 'liquor_signature_template_fields'],
  ['contract_send_sessions', 'liquor_signature_send_sessions'],
  ['contract_templates', 'liquor_signature_templates'],
  ['contract_packages', 'liquor_signature_packages'],
  ['identity_verification_sessions', 'liquor_signature_identity_sessions'],
  ['signature_evidences', 'liquor_signature_evidences'],
  ['contractPublicOtpApi', 'liquorSignaturePublicOtpApi'],
  ['contractPublicApi', 'liquorSignaturePublicApi'],
  ['contractAdminApi', 'liquorSignatureTemplateApi'],
  ['contractUserApi', 'liquorSignatureUserApi'],
  ['contractSignatureTestConsoleClient', 'liquorSignatureTemplateClient'],
  ['contractSignatureHistoryClient', 'liquorSignatureHistoryClient'],
  ['contractSignatureSendClient', 'liquorSignatureSendClient'],
  ['contractTemplateConfirmationFieldsClient', 'liquorSignatureTemplateConfirmationFieldsClient'],
  ['contractPublicClient', 'liquorSignaturePublicClient'],
  ['ContractSignatureTestConsolePage', 'LiquorSignatureTemplatesPage'],
  ['ContractSignatureHistoryPage', 'LiquorSignatureHistoryPage'],
  ['ContractSignatureSendPage', 'LiquorSignatureSendPage'],
  ['ContractSignatureUserSendRoute', 'LiquorSignatureUserSendRoute'],
  ['ContractSignatureTestRoute', 'LiquorSignatureTemplateRoute'],
  ['ContractSignDocumentPage', 'LiquorSignDocumentPage'],
  ['ContractSignPage', 'LiquorSignPage'],
  ['ContractAttachmentReviewModal', 'LiquorSignatureAttachmentReviewModal'],
  ['ContractTemplatePanel', 'LiquorSignatureTemplatePanel'],
  ['ContractTemplateConfirmationFieldsSection', 'LiquorSignatureTemplateConfirmationFieldsSection'],
  ['contractSignatureTestDisplay', 'liquorSignatureTemplateDisplay'],
  ['contractSignatureTestConsoleFlags', 'liquorSignatureTemplateFlags'],
  ['contract-signature-console.css', 'liquor-signature-console.css'],
  ['contract-signature-send-mobile.css', 'liquor-signature-send-mobile.css'],
  ['contract-public-sign.css', 'liquor-signature-public.css'],
  ['contractSignature', 'liquorSignature'],
  ['ContractSignature', 'LiquorSignature'],
  ['ContractSign', 'LiquorSign'],
  ['contractPublic', 'liquorSignaturePublic'],
  ['contractTemplate', 'liquorSignatureTemplate'],
  ['ContractTemplate', 'LiquorSignatureTemplate'],
  ['contractSend', 'liquorSignatureSend'],
  ['ContractSend', 'LiquorSignatureSend'],
  ['contractEvidence', 'liquorSignatureEvidence'],
  ['contractConfirmation', 'liquorSignatureConfirmation'],
  ['contractStamped', 'liquorSignatureStamped'],
  ['contractSender', 'liquorSignatureSender'],
  ['contractField', 'liquorSignatureField'],
  ['contractOtp', 'liquorSignatureOtp'],
  ['contractSelfSms', 'liquorSignatureSelfSms'],
  ['getContractOtp', 'getLiquorSignatureOtp'],
  ['CONTRACT_OTP', 'LIQUOR_SIGNATURE_OTP'],
  ['CONTRACT_TARGET_PHONE', 'LIQUOR_SIGNATURE_TARGET_PHONE'],
  ['contract_signature', 'liquor_signature'],
  ['contract_template_not_confirmation_only', 'liquor_signature_template_not_confirmation_only'],
  ['registerContractPublicOtpApi', 'registerLiquorSignaturePublicOtpApi'],
  ['registerContractPublicApi', 'registerLiquorSignaturePublicApi'],
  ['registerContractAdminApi', 'registerLiquorSignatureTemplateApi'],
  ['registerContractUserApi', 'registerLiquorSignatureUserApi'],
  ['requireContractUserSend', 'requireLiquorIndustrySignatureUser'],
  ['requireContractAdminConsole', 'requireLiquorIndustrySignatureAdmin'],
  ['assertContractTemplateAccess', 'assertLiquorSignatureTemplateAccess'],
  ['assertConfirmationOnlyTemplateRow', 'assertLiquorConfirmationOnlyTemplateRow'],
  ['reconcileContractFieldSettingsAfterPdfSave', 'reconcileLiquorSignatureFieldSettingsAfterPdfSave'],
  ['seedContractTemplateFieldSettings', 'seedLiquorSignatureTemplateFieldSettings'],
  ['normalizeContractFieldInputRole', 'normalizeLiquorSignatureFieldInputRole'],
  ['effectiveContractFieldRole', 'effectiveLiquorSignatureFieldRole'],
  ['assertContractFieldSettingsValidForActivate', 'assertLiquorSignatureFieldSettingsValidForActivate'],
  ['listSenderFieldsForContractTemplate', 'listSenderFieldsForLiquorSignatureTemplate'],
  ['/contracts/signatures/send', '/liquor/signatures/send'],
  ['/contracts/signatures/history', '/liquor/signatures/history'],
  ['/contracts/sign/', '/liquor/sign/'],
  ['/admin/contract-signatures', '/liquor/signature-templates'],
  ['/api/contracts/public/', '/api/liquor/signatures/public/'],
  ['/api/contracts/', '/api/liquor/signatures/'],
  ['/api/admin/contracts/', '/api/liquor/signature-templates/'],
  ['contracts/send-attachments/', 'liquor/signatures/send-attachments/'],
  ['contracts/send-sessions', 'liquor/signatures/send-sessions'],
  ['contracts/templates', 'liquor/signatures/templates'],
  ['CT_PREFIX', 'LST_PREFIX'],
  ['CTF_PREFIX', 'LSTF_PREFIX'],
  ['CTCF_PREFIX', 'LSTCF_PREFIX'],
  ['PKG_PREFIX', 'LSPKG_PREFIX'],
  ['CSS_PREFIX', 'LSS_PREFIX'],
  ['CDI_PREFIX', 'LSDI_PREFIX'],
  ["'ct_'", "'lst_'"],
  ["'css_'", "'lss_'"],
  ["'cdi_'", "'lsdi_'"],
  ["'ctcf_'", "'lstcf_'"],
  ["'ctf_'", "'lstf_'"],
  ["'pkg_'", "'lspkg_'"],
  ['../services/contract', '../services/liquorSignature'],
  ['./contract', './liquorSignature'],
  ["from './contract", "from './liquorSignature"],
  ["from '../services/contract", "from '../services/liquorSignature"],
  ['features/contracts/', 'features/liquor/signatures/'],
  ['../testConsole/', '../signatureTemplates/'],
  ['../../testConsole/', '../../signatureTemplates/'],
  ['../userHistory/', '../signatures/'],
  ['../userSend/', '../signatures/'],
  ['../public/', '../publicSignature/'],
  ['pdf_templates', 'liquor_pdf_templates'],
  ['pdf_template_fields', 'liquor_pdf_template_fields'],
  ['pdfTemplateRepo', 'liquorPdfTemplateRepo'],
  ['buildTemplateStorageKey', 'buildLiquorPdfTemplateStorageKey'],
  ['putTemplateObject', 'putLiquorPdfTemplateObject'],
  ['getTemplateObject', 'getLiquorPdfTemplateObject'],
  ['deleteTemplateObject', 'deleteLiquorPdfTemplateObject'],
  ['pdfTemplateStorage', 'liquorPdfTemplateStorage'],
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
  ['server/services/contractConfirmationItems.js', 'server/services/liquorSignatureConfirmationItems.js'],
  ['server/services/contractConfirmationOnlyEvidence.js', 'server/services/liquorSignatureConfirmationOnlyEvidence.js'],
  ['server/services/contractConfirmationPdfFromInstance.js', 'server/services/liquorSignatureConfirmationPdfFromInstance.js'],
  ['server/services/contractEvidencePdfService.js', 'server/services/liquorSignatureEvidencePdfService.js'],
  ['server/services/contractEvidenceService.js', 'server/services/liquorSignatureEvidenceService.js'],
  ['server/services/contractFieldValueNormalize.js', 'server/services/liquorSignatureFieldValueNormalize.js'],
  ['server/services/contractOtpService.js', 'server/services/liquorSignatureOtpService.js'],
  ['server/services/contractSendAttachments.js', 'server/services/liquorSignatureSendAttachments.js'],
  ['server/services/contractSenderPrefill.js', 'server/services/liquorSignatureSenderPrefill.js'],
  ['server/services/contractSendSessionConfirmationFieldValues.js', 'server/services/liquorSignatureSendSessionConfirmationFieldValues.js'],
  ['server/services/contractStampedPdfFromInstance.js', 'server/services/liquorSignatureStampedPdfFromInstance.js'],
  ['server/services/contractTemplateFieldSettings.js', 'server/services/liquorSignatureTemplateFieldSettings.js'],
  ['server/services/contractSelfSmsSend.js', 'server/services/liquorSignatureSelfSmsSend.js'],
  ['server/lib/contractOtpConfig.js', 'server/lib/liquorSignatureOtpConfig.js'],
  ['server/lib/contractStoredPhone.js', 'server/lib/liquorSignatureStoredPhone.js'],
]

const API_MAP = [
  ['server/apis/contractAdminApi.js', 'server/apis/liquorSignatureTemplateApi.js'],
  ['server/apis/contractUserApi.js', 'server/apis/liquorSignatureUserApi.js'],
  ['server/apis/contractPublicApi.js', 'server/apis/liquorSignaturePublicApi.js'],
  ['server/apis/contractPublicOtpApi.js', 'server/apis/liquorSignaturePublicOtpApi.js'],
]

const FRONTEND_MAP = [
  ['src/features/contracts/public/ContractSignPage.tsx', 'src/features/liquor/publicSignature/LiquorSignPage.tsx'],
  ['src/features/contracts/public/ContractSignDocumentPage.tsx', 'src/features/liquor/publicSignature/LiquorSignDocumentPage.tsx'],
  ['src/features/contracts/public/contractPublicClient.ts', 'src/features/liquor/publicSignature/liquorSignaturePublicClient.ts'],
  ['src/features/contracts/public/contract-public-sign.css', 'src/features/liquor/publicSignature/liquor-signature-public.css'],
  ['src/features/contracts/public/components/PublicPdfPreviewModal.tsx', 'src/features/liquor/publicSignature/components/PublicPdfPreviewModal.tsx'],
  ['src/features/contracts/public/components/ContractAttachmentReviewModal.tsx', 'src/features/liquor/publicSignature/components/LiquorSignatureAttachmentReviewModal.tsx'],
  ['src/features/contracts/userSend/ContractSignatureSendPage.tsx', 'src/features/liquor/signatures/LiquorSignatureSendPage.tsx'],
  ['src/features/contracts/userSend/ContractSignatureUserSendRoute.tsx', 'src/features/liquor/signatures/LiquorSignatureUserSendRoute.tsx'],
  ['src/features/contracts/userSend/contractSignatureSendClient.ts', 'src/features/liquor/signatures/liquorSignatureSendClient.ts'],
  ['src/features/contracts/userSend/contract-signature-send-mobile.css', 'src/features/liquor/signatures/liquor-signature-send-mobile.css'],
  ['src/features/contracts/userSend/SendAttachmentFileInput.tsx', 'src/features/liquor/signatures/SendAttachmentFileInput.tsx'],
  ['src/features/contracts/userSend/ConfirmationOnlySendFieldsSection.tsx', 'src/features/liquor/signatures/ConfirmationOnlySendFieldsSection.tsx'],
  ['src/features/contracts/userHistory/ContractSignatureHistoryPage.tsx', 'src/features/liquor/signatures/LiquorSignatureHistoryPage.tsx'],
  ['src/features/contracts/userHistory/contractSignatureHistoryClient.ts', 'src/features/liquor/signatures/liquorSignatureHistoryClient.ts'],
  ['src/features/contracts/userHistory/sendSessionStaffDisplay.ts', 'src/features/liquor/signatures/sendSessionStaffDisplay.ts'],
  ['src/features/contracts/userHistory/components/SendSessionHistoryList.tsx', 'src/features/liquor/signatures/components/SendSessionHistoryList.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionHistoryFilters.tsx', 'src/features/liquor/signatures/components/SendSessionHistoryFilters.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionDetailPanel.tsx', 'src/features/liquor/signatures/components/SendSessionDetailPanel.tsx'],
  ['src/features/contracts/userHistory/components/SendSessionStatusBadge.tsx', 'src/features/liquor/signatures/components/SendSessionStatusBadge.tsx'],
  ['src/features/contracts/userHistory/components/ContractTableCells.tsx', 'src/features/liquor/signatures/components/LiquorSignatureTableCells.tsx'],
  ['src/features/contracts/testConsole/ContractSignatureTestConsolePage.tsx', 'src/features/liquor/signatureTemplates/LiquorSignatureTemplatesPage.tsx'],
  ['src/features/contracts/testConsole/ContractSignatureTestRoute.tsx', 'src/features/liquor/signatureTemplates/LiquorSignatureTemplateRoute.tsx'],
  ['src/features/contracts/testConsole/contractSignatureTestConsoleClient.ts', 'src/features/liquor/signatureTemplates/liquorSignatureTemplateClient.ts'],
  ['src/features/contracts/testConsole/contractSignatureTestDisplay.ts', 'src/features/liquor/signatureTemplates/liquorSignatureTemplateDisplay.ts'],
  ['src/features/contracts/testConsole/contractSignatureTestConsoleFlags.ts', 'src/features/liquor/signatureTemplates/liquorSignatureTemplateFlags.ts'],
  ['src/features/contracts/testConsole/contractTemplateConfirmationFieldsClient.ts', 'src/features/liquor/signatureTemplates/liquorSignatureTemplateConfirmationFieldsClient.ts'],
  ['src/features/contracts/testConsole/contract-signature-console.css', 'src/features/liquor/signatureTemplates/liquor-signature-console.css'],
  ['src/features/contracts/testConsole/components/ContractTemplatePanel.tsx', 'src/features/liquor/signatureTemplates/components/LiquorSignatureTemplatePanel.tsx'],
  ['src/features/contracts/testConsole/components/ContractTemplateConfirmationFieldsSection.tsx', 'src/features/liquor/signatureTemplates/components/LiquorSignatureTemplateConfirmationFieldsSection.tsx'],
  ['src/features/contracts/testConsole/components/PdfTemplateSelector.tsx', 'src/features/liquor/signatureTemplates/components/PdfTemplateSelector.tsx'],
  ['src/features/contracts/testConsole/components/CustomerSelector.tsx', 'src/features/liquor/signatureTemplates/components/CustomerSelector.tsx'],
  ['src/features/contracts/testConsole/components/SendSessionPanel.tsx', 'src/features/liquor/signatureTemplates/components/SendSessionPanel.tsx'],
  ['src/features/contracts/testConsole/components/EvidenceStatusPanel.tsx', 'src/features/liquor/signatureTemplates/components/EvidenceStatusPanel.tsx'],
]

copyTransform(
  'server/pdf-engine/repository/pdfTemplateRepo.js',
  'server/pdf-engine/repository/liquorPdfTemplateRepo.js',
)
copyTransform(
  'server/pdf-engine/storage/pdfTemplateStorage.js',
  'server/pdf-engine/storage/liquorPdfTemplateStorage.js',
)
copyTransform(
  'server/apis/governmentSignaturePdfTemplateApi.js',
  'server/apis/liquorSignaturePdfTemplateApi.js',
)

for (const [s, d] of SERVICE_MAP) copyTransform(s, d)
for (const [s, d] of API_MAP) copyTransform(s, d)
for (const [s, d] of FRONTEND_MAP) copyTransform(s, d)

console.log('\nDone. Wire registerLiquorSignatureApi + schema + routes manually.')
