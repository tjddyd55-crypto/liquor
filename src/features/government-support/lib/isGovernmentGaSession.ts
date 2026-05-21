/** users.ga_code — 정부지원 CRM 전용 GA (보험 YJASSET 등과 분리) */
export const GOVERNMENT_CRM_GA_CODE = 'GOVERNMENT_CRM'

type GaSessionUser = {
  gaCode?: string | null
}

export function isGovernmentGaSession(user: GaSessionUser | null | undefined): boolean {
  return String(user?.gaCode ?? '')
    .trim()
    .toUpperCase() === GOVERNMENT_CRM_GA_CODE
}
