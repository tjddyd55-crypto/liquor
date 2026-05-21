import { Navigate } from 'react-router-dom'

/** 레거시 경로 — 보험사 목록·바로가기는 제거되었습니다. */
export function InsurerListPage() {
  return <Navigate to="/portal/newsletters" replace />
}
