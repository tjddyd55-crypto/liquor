import { Navigate } from 'react-router-dom'

/** 레거시 경로 — 보험사별 필터 화면은 제거되었습니다. */
export function InsurerNewsletterListPage() {
  return <Navigate to="/portal/newsletters" replace />
}
