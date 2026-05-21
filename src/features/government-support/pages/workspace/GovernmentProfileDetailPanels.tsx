import { Link } from 'react-router-dom'
import { EmptyState } from '../../../../components/feedback'
import { GOVERNMENT_EDOC_TEMPLATES } from '../../adapters/governmentContractAdapter'
import { GOVERNMENT_SCHEDULE_TYPES } from '../../constants/governmentDocumentTypes'
import type { GovernmentProfileWorkspaceTab } from '../../config/governmentProfileWorkspaceTabs'
import { useGovernmentProfileWorkspaceContext } from './governmentProfileWorkspaceContext'
import GovernmentProfileMemosPanel from './GovernmentProfileMemosPanel'
import GovernmentProfileConsultationsPanel from './GovernmentProfileConsultationsPanel'
import GovernmentProfileProgressPanel from './GovernmentProfileProgressPanel'
import GovernmentProfileFilesPanel from './GovernmentProfileFilesPanel'

type GovernmentProfileDetailPanelsProps = {
  tab: GovernmentProfileWorkspaceTab
}

export default function GovernmentProfileDetailPanels({ tab }: GovernmentProfileDetailPanelsProps) {
  const ws = useGovernmentProfileWorkspaceContext()
  const p = ws.selected
  if (!p) {
    return <EmptyState message="사업장을 선택해 주세요." />
  }

  if (tab === 'files') {
    return <GovernmentProfileFilesPanel />
  }

  if (tab === 'consultations') {
    return <GovernmentProfileConsultationsPanel />
  }

  if (tab === 'memos') {
    return <GovernmentProfileMemosPanel />
  }

  if (tab === 'progress') {
    return <GovernmentProfileProgressPanel />
  }

  if (tab === 'signatures') {
    return (
      <div>
        <p className="government-page__muted">전자서명 발송·이력은 전자서명 메뉴에서 이어서 처리합니다.</p>
        <ul style={{ marginTop: '0.75rem', color: '#e5e7eb' }}>
          {GOVERNMENT_EDOC_TEMPLATES.map((name) => (
            <li key={name} style={{ marginBottom: '0.35rem' }}>
              {name}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: '1rem' }}>
          <Link to="/government/signatures/send" className="dark-link">
            전자서명 발송 화면 열기
          </Link>
          {' · '}
          <Link to="/government/signatures" className="dark-link">
            발송 이력
          </Link>
        </p>
        <p className="government-page__muted" style={{ marginTop: '1rem' }}>
          일정관리 — <Link to="/todos">할일/일정</Link> 모듈과 연동 예정 (tenant·신청건 기준).
        </p>
        <ul style={{ marginTop: '0.5rem', color: '#94a3b8' }}>
          {GOVERNMENT_SCHEDULE_TYPES.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>
      </div>
    )
  }

  return <EmptyState message="준비 중입니다." />
}
