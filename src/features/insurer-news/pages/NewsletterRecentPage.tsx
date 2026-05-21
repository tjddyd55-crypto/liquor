import { Navigate } from 'react-router-dom'

/** 레거시 경로 — 목록은 허브 한 화면으로 통합되었습니다. */
export function NewsletterRecentPage() {
  return <Navigate to="/portal/newsletters" replace />
}
