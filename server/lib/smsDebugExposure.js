/**
 * SMS 인증번호 debugCode API 노출 여부 (develop·테스트 채널 전용).
 * @param {boolean} runningInProduction
 */
export function isGovernmentRailwayDevelop() {
  const isGovApp = String(process.env.APP_PRODUCT ?? '').trim() === 'government'
  const railwayEnv = String(process.env.RAILWAY_ENVIRONMENT ?? '').trim().toLowerCase()
  return isGovApp && railwayEnv === 'develop'
}

/** Railway develop 등에서 INSURANCE_SMS_DEBUG_RESPONSE_CODE=true 로 명시 opt-in */
export function isExplicitSmsDebugResponseEnabled() {
  const flag = String(process.env.INSURANCE_SMS_DEBUG_RESPONSE_CODE ?? '')
    .trim()
    .toLowerCase()
  if (flag !== 'true') {
    return false
  }
  const railwayEnv = String(process.env.RAILWAY_ENVIRONMENT ?? '').trim().toLowerCase()
  return railwayEnv === 'develop' || railwayEnv === 'development'
}

export function exposeSmsDebugCode(runningInProduction) {
  const aligoTest = String(process.env.ALIGO_TEST_MODE ?? 'Y')
    .trim()
    .toUpperCase()
  const isGovApp = String(process.env.APP_PRODUCT ?? '').trim() === 'government'
  const railwayEnv = String(process.env.RAILWAY_ENVIRONMENT ?? '').trim().toLowerCase()
  if (isGovApp && railwayEnv === 'develop' && ['Y', 'TRUE', '1', 'YES'].includes(aligoTest)) {
    return true
  }
  if (isExplicitSmsDebugResponseEnabled()) {
    return true
  }
  return (
    !runningInProduction &&
    String(process.env.INSURANCE_SMS_DEBUG_RESPONSE_CODE ?? '').trim() === 'true'
  )
}
