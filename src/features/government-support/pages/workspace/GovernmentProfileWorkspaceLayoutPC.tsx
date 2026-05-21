import { Outlet } from 'react-router-dom'
import { EmptyState } from '../../../../components/feedback'
import { FormButton } from '../../../../components/form'
import type { GovernmentProfileWorkspaceLayoutViewProps } from './governmentProfileWorkspaceViewProps'

function rightTitle(pathname: string): string {
  if (pathname.includes('/consultations')) {
    return '상담 이력'
  }
  if (pathname.includes('/memos')) {
    return '메모'
  }
  if (pathname.includes('/progress')) {
    return '진행상황'
  }
  if (pathname.includes('/signatures')) {
    return '전자서명'
  }
  if (pathname.includes('/files')) {
    return '서류/파일'
  }
  return '작업 영역'
}

export default function GovernmentProfileWorkspaceLayoutPC({
  pathname,
  selectedProfileId,
  selectedProfile,
  selectedProfileLabel,
  activeTab,
  onClickFiles,
  onClickConsultations,
  onClickMemos,
  onClickProgress,
  onClickSignatures,
}: GovernmentProfileWorkspaceLayoutViewProps) {
  const isIndexPath =
    pathname === '/government/my-applications' || pathname === '/government/my-applications/'

  return (
    <section className="customer-workspace-layout__right" aria-label="사업장 연동 작업영역">
      <header className="customer-workspace-layout__right-header">
        <div className="customer-workspace-layout__customer-meta">
          <div className="customer-workspace-layout__title-row">
            <h2 className="customer-workspace-layout__title">
              {selectedProfileId ? selectedProfileLabel || '선택 사업장' : rightTitle(pathname)}
            </h2>
          </div>
          <p className="customer-workspace-layout__subtitle">
            {selectedProfileId
              ? `고객 ${selectedProfile?.customerName || '-'} · 연락처 ${selectedProfile?.phone || '-'} · ${selectedProfile?.progressStatus || '-'}`
              : '사업장을 선택해 주세요.'}
          </p>
        </div>
        <div className="customer-workspace-layout__actions">
          <FormButton
            htmlType="button"
            variant="action"
            className={`filter-button${activeTab === 'files' ? ' filter-button--workspace-active' : ''}`}
            disabled={!selectedProfileId}
            onClick={onClickFiles}
          >
            서류/파일
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className={`filter-button${activeTab === 'consultations' ? ' filter-button--workspace-active' : ''}`}
            disabled={!selectedProfileId}
            onClick={onClickConsultations}
          >
            상담 이력
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className={`filter-button${activeTab === 'memos' ? ' filter-button--workspace-active' : ''}`}
            disabled={!selectedProfileId}
            onClick={onClickMemos}
          >
            메모
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className={`filter-button${activeTab === 'progress' ? ' filter-button--workspace-active' : ''}`}
            disabled={!selectedProfileId}
            onClick={onClickProgress}
          >
            진행상황
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className={`filter-button${activeTab === 'signatures' ? ' filter-button--workspace-active' : ''}`}
            disabled={!selectedProfileId}
            onClick={onClickSignatures}
          >
            전자서명
          </FormButton>
        </div>
      </header>

      <div className="customer-workspace-layout__right-body">
        {selectedProfileId || isIndexPath ? (
          <Outlet key={selectedProfileId ?? 'profile-index'} context={{ selectedProfileId }} />
        ) : (
          <EmptyState message="사업장을 선택해 주세요." />
        )}
      </div>
    </section>
  )
}
