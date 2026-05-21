import { Link } from 'react-router-dom'
import { GOVERNMENT_APP_TITLE } from '../../../../config/governmentAppMeta'
import { useDocumentTitle } from '../../../../hooks/useDocumentTitle'
import '../../government-support.css'

export default function GovernmentAdminHubPage() {
  useDocumentTitle(`${GOVERNMENT_APP_TITLE} · 관리`)
  return (
    <main className="page government-page" style={{ padding: '1.5rem' }}>
      <h1 className="government-page__title">정부지원 업종 관리</h1>
      <p className="government-page__muted">플랫폼 관리(/admin/platform)와 분리된 government 전용 관리 화면입니다.</p>
      <ul style={{ marginTop: '1.5rem', lineHeight: 2 }}>
        <li>
          <Link to="/government/admin/agencies" className="dark-link">
            대행사 등록 · agencyCode 발급
          </Link>
        </li>
        <li>
          <Link to="/government/admin/templates" className="dark-link">
            고객관리 템플릿 (동적/정적 안내)
          </Link>
        </li>
        <li>
          <Link to="/government/admin/pdf-templates" className="dark-link">
            PDF 좌표 템플릿
          </Link>
        </li>
        <li>
          <Link to="/government/workspace" className="dark-link">
            워크스페이스
          </Link>
        </li>
      </ul>
    </main>
  )
}
