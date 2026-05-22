/**
 * 향후 전자문서/전자서명 액션 정의 (placeholder SSOT).
 */
import type { LiquorDocumentSourceType, LiquorFutureDocumentKind } from './liquorDocumentKinds'

export type LiquorDocumentEntityType = 'support_item' | 'support_contract' | 'repayment'

export type LiquorDocumentActionId =
  | 'generate_goods_support_confirmation'
  | 'generate_item_install_confirmation'
  | 'generate_item_recovery_confirmation'
  | 'generate_support_contract'
  | 'generate_loan_agreement'
  | 'generate_repayment_confirmation'
  | 'generate_deposit_confirmation'
  | 'send_uploaded_pdf_template'
  | 'view_linked_documents'

export type LiquorDocumentActionDef = {
  id: LiquorDocumentActionId
  label: string
  sourceType: LiquorDocumentSourceType | 'navigation'
  documentKind?: LiquorFutureDocumentKind
  /** 향후 uploaded_pdf 템플릿 선택 등 */
  actionType?: 'choose_template' | 'view_files'
  hint: string
}

const PLACEHOLDER_HINT = '전자문서 연동 준비 중'

export const LIQUOR_SUPPORT_ITEM_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_goods_support_confirmation',
    label: '물품지원 확인서 만들기',
    sourceType: 'generated_document',
    documentKind: 'goods_support_confirmation',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'generate_item_install_confirmation',
    label: '설치 확인서 만들기',
    sourceType: 'generated_document',
    documentKind: 'item_install_confirmation',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'generate_item_recovery_confirmation',
    label: '회수 확인서 만들기',
    sourceType: 'generated_document',
    documentKind: 'item_recovery_confirmation',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'send_uploaded_pdf_template',
    label: '기존 PDF로 전자서명',
    sourceType: 'uploaded_pdf',
    actionType: 'choose_template',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'view_linked_documents',
    label: '관련 완료 PDF 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    hint: '첨부문서 탭에서 이 물품에 연결된 문서를 확인할 수 있습니다.',
  },
]

export const LIQUOR_SUPPORT_CONTRACT_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_support_contract',
    label: '지원계약서 만들기',
    sourceType: 'generated_document',
    documentKind: 'support_contract_agreement',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'generate_loan_agreement',
    label: '차용증 만들기',
    sourceType: 'generated_document',
    documentKind: 'loan_agreement',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'send_uploaded_pdf_template',
    label: '기존 PDF로 전자서명',
    sourceType: 'uploaded_pdf',
    actionType: 'choose_template',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'view_linked_documents',
    label: '관련 완료 PDF 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    hint: PLACEHOLDER_HINT,
  },
]

export const LIQUOR_REPAYMENT_DOCUMENT_ACTIONS: LiquorDocumentActionDef[] = [
  {
    id: 'generate_repayment_confirmation',
    label: '상환확인서 만들기',
    sourceType: 'generated_document',
    documentKind: 'repayment_confirmation',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'generate_deposit_confirmation',
    label: '입금확인서 만들기',
    sourceType: 'generated_document',
    documentKind: 'deposit_confirmation',
    hint: PLACEHOLDER_HINT,
  },
  {
    id: 'view_linked_documents',
    label: '관련 완료 PDF 보기',
    sourceType: 'navigation',
    actionType: 'view_files',
    hint: PLACEHOLDER_HINT,
  },
]

export function documentActionsForEntity(entityType: LiquorDocumentEntityType): LiquorDocumentActionDef[] {
  if (entityType === 'support_item') return LIQUOR_SUPPORT_ITEM_DOCUMENT_ACTIONS
  if (entityType === 'support_contract') return LIQUOR_SUPPORT_CONTRACT_DOCUMENT_ACTIONS
  return LIQUOR_REPAYMENT_DOCUMENT_ACTIONS
}
