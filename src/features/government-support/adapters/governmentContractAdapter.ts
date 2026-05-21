/**
 * 기존 contracts 모듈 연동용 adapter (발송 UI는 ContractSignatureSendPage 재사용 예정).
 * 8단계: 신청/청약 건 메타를 전자문서 발송 컨텍스트로 전달할 때 사용.
 */
export type GovernmentEdocLinkRow = {
  id: string
  documentName: string
  sentAt: string | null
  recipient: string
  signStatus: string
  completedAt: string | null
  applicationCaseId: string | null
}

export const GOVERNMENT_EDOC_TEMPLATES = [
  '개인정보 수집·이용 동의서',
  '정부지원 상담 동의서',
  '사업장 정보 확인서',
  '지원상품 설명 확인서',
  '수임료 약정서',
  '금융인증서 위임 동의서',
  '서류 제출 확인서',
] as const

export function buildGovernmentEdocDraft(
  profileId: string,
  tenantId: string,
  documentName: string,
  recipient: string,
  applicationCaseId?: string | null,
) {
  return {
    profileId,
    tenantId,
    documentName,
    recipient,
    applicationCaseId: applicationCaseId ?? null,
    signStatus: '대기',
  }
}
