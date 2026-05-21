import { Navigate } from 'react-router-dom'

/** 보험 CRM `my-businesses` → workspace SSOT `my-applications` 리다이렉트 */
export default function GovernmentUserBusinessesPage() {
  return <Navigate to="/government/my-applications" replace />
}
