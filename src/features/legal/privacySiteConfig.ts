/**
 * 스토어 심사·고지용 개인정보처리방침에서 바꿀 값만 모았습니다.
 * 배포 전 운영 주체 정보를 실제 값으로 수정하세요.
 */
export const privacySiteConfig = {
  /** 브라우저 탭 제목 */
  documentTitle: '개인정보처리방침',
  /** 검색·미리보기용 (120자 내 권장) */
  metaDescription:
    '보험 신청·고객 관리 서비스의 개인정보 수집·이용, 보관, 파기 및 정보주체 권리 안내입니다.',
  metaRobots: 'index, follow',
  /** 서비스·앱 명칭 (문서 내 표기) */
  serviceName: '보험 신청·고객관리 서비스',
  /** 법적 운영자 상호(예: 회사명) */
  operatorLegalName: '(주)○○○',
  /** 대표자 성명 (필요 시 문서에 반영) */
  representativeName: '○○○',
  /** 사업자등록번호 (선택, 공개 정책에 따라 기입) */
  businessRegistrationNumber: '000-00-00000',
  /** 주소 */
  address: '서울특별시 ○○구 ○○로 00, ○○빌딩 0층 (○○동)',
  /** 개인정보 보호책임자 성명 */
  privacyOfficerName: '○○○',
  /** 소속/직책 */
  privacyOfficerRole: '개인정보 보호책임자(○○팀/임원)',
  /** 문의 이메일 — mailto 링크에 사용 */
  privacyEmail: 'privacy@example.com',
  /** 문의 전화 (선택) */
  privacyPhone: '02-0000-0000',
  /** 방침 시행일 */
  effectiveDate: '2026년 4월 1일',
  /** 최종 개정일 (시행일과 같을 수 있음) */
  lastRevisedDate: '2026년 4월 1일',
} as const
