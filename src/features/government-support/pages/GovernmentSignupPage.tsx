import { RegisterPage } from '../../auth/pages/RegisterPage'

/** 기존 RegisterPage 재사용 — government 업종 가입 (회귀 최소화) */
export default function GovernmentSignupPage() {
  return <RegisterPage signupIndustry="government" />
}
