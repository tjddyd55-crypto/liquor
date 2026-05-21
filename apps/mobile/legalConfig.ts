/**
 * 법률·정책 URL 및 향후 동의(Consent) 확장 지점.
 * - 동의 버전/약관 URL 등은 여기에만 추가하면 앱 진입부에서 일괄 참조 가능.
 */
export const LEGAL_CONFIG = {
  /**
   * 스토어·앱 내 링크용 개인정보처리방침 URL.
   * 자체 도메인으로 바꿀 경우 여기만 수정하면 됩니다.
   */
  privacyPolicyUrl:
    'https://insurance-production-7bd8.up.railway.app/privacy',
} as const;

// Future: consentVersion, termsOfServiceUrl, lastAcceptedAt 키, 등
