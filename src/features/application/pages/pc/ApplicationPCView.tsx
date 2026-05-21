import { Navigate } from 'react-router-dom'

/** 레거시 자동차 신청 허브(`/application`) 진입 시 PDF 템플릿 기반 신청서 작성으로 통일한다. */
export default function ApplicationPCView() {
  return <Navigate to="/application/documents" replace />
}
