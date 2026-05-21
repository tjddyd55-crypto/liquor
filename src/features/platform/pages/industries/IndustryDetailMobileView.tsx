import { useMemo } from 'react'
import FormButton from '../../../../components/form/FormButton'
import FormInput from '../../../../components/form/FormInput'
import { PlatformUserSearchSelect } from '../../components/PlatformUserSearchSelect'
import type { IndustryDetailViewProps } from './IndustryDetailPage'
import {
  IndustryTenantAdminManageSection,
  IndustryTenantCreateSection,
  IndustryTenantStaffUserManageSection,
  IndustryTenantsListSection,
} from './IndustryDetailTenantSections'
import { IndustryTenantSeatBillingSection } from './IndustryTenantSeatBillingSection'

export default function IndustryDetailMobileView({
  industryIdRaw,
  industryParamInvalid,
  industriesLoading,
  industriesError,
  industryRow,
  industryMissingFromList,
  admins,
  adminsLoading,
  adminsError,
  assignUserId,
  setAssignUserId,
  assignSubmitting,
  assignSuccessMessage,
  assignErrorMessage,
  reload,
  onAssignSubmit,
  clearAssignFeedback,
  tenantsForIndustry,
  tenantsLoading,
  tenantsError,
  refetchTenants,
  canCreateTenant,
  industryInactive,
  tenantCreateCode,
  setTenantCreateCode,
  tenantCreateName,
  setTenantCreateName,
  tenantCreateStatus,
  setTenantCreateStatus,
  tenantCreateLegacyGaId,
  setTenantCreateLegacyGaId,
  tenantCreateSubmitting,
  tenantCreateSuccessMessage,
  tenantCreateErrorMessage,
  onTenantCreateSubmit,
  clearTenantCreateFeedback,
  tenantAdminTargetTenantId,
  tenantAdmins,
  tenantAdminsLoading,
  tenantAdminsError,
  openTenantAdminManage,
  closeTenantAdminManage,
  refetchTenantAdmins,
  tenantAssignUserId,
  setTenantAssignUserId,
  tenantAssignSubmitting,
  tenantAssignSuccessMessage,
  tenantAssignErrorMessage,
  onTenantAdminAssignSubmit,
  clearTenantAdminAssignFeedback,
  tenantMembers,
  tenantMembersLoading,
  tenantMembersError,
  refetchTenantMembers,
  tenantMemberAssignUserId,
  setTenantMemberAssignUserId,
  tenantMemberAssignRole,
  setTenantMemberAssignRole,
  tenantMemberAssignSubmitting,
  tenantMemberAssignSuccessMessage,
  tenantMemberAssignErrorMessage,
  onTenantMemberAssignSubmit,
  clearTenantMemberAssignFeedback,
  token,
  industryIdKey,
}: IndustryDetailViewProps) {
  const canAssign = Boolean(industryRow) && !industriesLoading && !industriesError
  const tenantAdminPanelEnabled = Boolean(industryRow) && !industriesLoading && !industriesError

  const selectedTenantForAdminManage = useMemo(() => {
    if (tenantAdminTargetTenantId == null) {
      return null
    }
    return tenantsForIndustry.find((t) => t.id === tenantAdminTargetTenantId) ?? null
  }, [tenantsForIndustry, tenantAdminTargetTenantId])

  const tenantSectionProps = {
    variant: 'mobile' as const,
    industryRowPresent: Boolean(industryRow),
    tenants: tenantsForIndustry,
    tenantsLoading,
    tenantsError,
    onRetryTenants: refetchTenants,
    tenantAdminTargetTenantId,
    openTenantAdminManage,
    tenantAdminPanelEnabled,
    canCreateTenant,
    industryInactive,
    tenantCreateCode,
    setTenantCreateCode,
    tenantCreateName,
    setTenantCreateName,
    tenantCreateStatus,
    setTenantCreateStatus,
    tenantCreateLegacyGaId,
    setTenantCreateLegacyGaId,
    tenantCreateSubmitting,
    tenantCreateSuccessMessage,
    tenantCreateErrorMessage,
    onTenantCreateSubmit,
    clearTenantCreateFeedback,
  }

  return (
    <main className="page platform-industry-detail-page platform-admin-page platform-industry-detail-page--mobile platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Industry 관리</h1>
        <p className="platform-admin-page__muted platform-admin-page__mono">id {industryIdRaw || '—'} · Tenant</p>
      </header>

      {industryParamInvalid ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>유효한 industry id가 필요합니다.</p>
        </div>
      ) : null}

      {industriesLoading ? <p className="platform-admin-page__muted">업종 정보를 불러오는 중…</p> : null}

      {industriesError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{industriesError}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => void reload()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {industryMissingFromList ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>업종을 찾을 수 없습니다.</p>
        </div>
      ) : null}

      {industryRow ? (
        <section className="platform-admin-page__stack-card" aria-labelledby="m-summary">
          <h2 id="m-summary" className="platform-admin-page__stack-title">
            Industry 요약
          </h2>
          <dl className="platform-admin-page__dl">
            <dt>id</dt>
            <dd className="platform-admin-page__mono">{industryRow.id}</dd>
            <dt>code</dt>
            <dd>{industryRow.code}</dd>
            <dt>name</dt>
            <dd>{industryRow.name}</dd>
            <dt>status</dt>
            <dd>{industryRow.status}</dd>
            <dt>createdAt</dt>
            <dd className="platform-admin-page__mono">{industryRow.createdAt ?? '—'}</dd>
            <dt>updatedAt</dt>
            <dd className="platform-admin-page__mono">{industryRow.updatedAt ?? '—'}</dd>
          </dl>
        </section>
      ) : null}

      <section aria-labelledby="m-admins">
        <h2 id="m-admins" className="platform-admin-page__stack-title">
          Industry Admin 목록
        </h2>
        {adminsError ? (
          <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
            <p>{adminsError}</p>
            <button type="button" className="platform-admin-page__btn" onClick={() => void reload()}>
              다시 시도
            </button>
          </div>
        ) : null}
        {adminsLoading ? <p className="platform-admin-page__muted">목록을 불러오는 중…</p> : null}
        {!adminsLoading && !adminsError && industryRow ? (
          <ul className="platform-admin-page__card-list">
            {admins.map((row) => (
              <li key={row.membershipId} className="platform-admin-page__stack-card">
                <div className="platform-admin-page__stack-title">{row.username}</div>
                <div className="platform-admin-page__stack-meta platform-admin-page__mono">{row.userId}</div>
                <div className="platform-admin-page__stack-meta">
                  {row.legacyRole} · {row.membershipRole} · {row.status}
                </div>
                <div className="platform-admin-page__stack-meta platform-admin-page__mono">
                  membership {row.membershipId}
                </div>
                <div className="platform-admin-page__stack-meta">
                  {row.createdAt ?? '—'} → {row.updatedAt ?? '—'}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {!adminsLoading && !adminsError && industryRow && admins.length === 0 ? (
          <p className="platform-admin-page__muted">등록된 Industry Admin 이 없습니다.</p>
        ) : null}
      </section>

      {assignSuccessMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
          <p>{assignSuccessMessage}</p>
        </div>
      ) : null}

      {assignErrorMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{assignErrorMessage}</p>
        </div>
      ) : null}

      {canAssign ? (
        <section className="platform-admin-page__industry-create" aria-labelledby="m-assign">
          <h2 id="m-assign" className="platform-admin-page__stack-title">
            Industry Admin 지정 (Super Admin)
          </h2>
          <form className="platform-admin-page__industry-create-form" onSubmit={onAssignSubmit}>
            <PlatformUserSearchSelect
              token={token}
              userIdValue={assignUserId}
              setUserId={setAssignUserId}
              variant="mobile"
              disabled={assignSubmitting}
              searchInputId="platform-industry-assign-user-search-m"
              onInteract={clearAssignFeedback}
            />
            <div className="platform-admin-page__form-field">
              <label className="dark-label" htmlFor="platform-industry-admin-userid-m">
                userId <span className="platform-admin-page__required">*</span>
              </label>
              <p className="platform-admin-page__field-hint">검색으로 선택했거나 users.id(UUID)를 직접 입력합니다.</p>
              <FormInput
                id="platform-industry-admin-userid-m"
                name="userId"
                autoComplete="off"
                value={assignUserId}
                onChange={(e) => {
                  clearAssignFeedback()
                  setAssignUserId(e.target.value)
                }}
                disabled={assignSubmitting}
                placeholder="users.id"
              />
            </div>
            <div className="platform-admin-page__form-actions">
              <FormButton
                htmlType="submit"
                variant="primary"
                loading={assignSubmitting}
                loadingText="지정 중…"
                disabled={assignSubmitting}
                fullWidth
              >
                Industry Admin 지정
              </FormButton>
            </div>
          </form>
        </section>
      ) : null}

      <IndustryTenantsListSection variant="mobile" {...tenantSectionProps} />
      <IndustryTenantAdminManageSection
        variant="mobile"
        industryRowPresent={Boolean(industryRow)}
        tenantAdminTargetTenantId={tenantAdminTargetTenantId}
        selectedTenant={selectedTenantForAdminManage}
        tenantAdmins={tenantAdmins}
        tenantAdminsLoading={tenantAdminsLoading}
        tenantAdminsError={tenantAdminsError}
        refetchTenantAdmins={refetchTenantAdmins}
        tenantAssignUserId={tenantAssignUserId}
        setTenantAssignUserId={setTenantAssignUserId}
        tenantAssignSubmitting={tenantAssignSubmitting}
        tenantAssignSuccessMessage={tenantAssignSuccessMessage}
        tenantAssignErrorMessage={tenantAssignErrorMessage}
        onTenantAdminAssignSubmit={onTenantAdminAssignSubmit}
        clearTenantAdminAssignFeedback={clearTenantAdminAssignFeedback}
        closeTenantAdminManage={closeTenantAdminManage}
        token={token}
        refetchTenants={refetchTenants}
      />
      <IndustryTenantSeatBillingSection
        variant="mobile"
        industryRowPresent={Boolean(industryRow)}
        industryIdForApi={industryRow?.id ?? industryIdKey}
        tenantAdminTargetTenantId={tenantAdminTargetTenantId}
        selectedTenant={selectedTenantForAdminManage}
        token={token}
        refetchTenants={refetchTenants}
      />
      <IndustryTenantStaffUserManageSection
        variant="mobile"
        industryRowPresent={Boolean(industryRow)}
        tenantAdminTargetTenantId={tenantAdminTargetTenantId}
        selectedTenant={selectedTenantForAdminManage}
        tenantMembers={tenantMembers}
        tenantMembersLoading={tenantMembersLoading}
        tenantMembersError={tenantMembersError}
        refetchTenantMembers={refetchTenantMembers}
        tenantMemberAssignUserId={tenantMemberAssignUserId}
        setTenantMemberAssignUserId={setTenantMemberAssignUserId}
        tenantMemberAssignRole={tenantMemberAssignRole}
        setTenantMemberAssignRole={setTenantMemberAssignRole}
        tenantMemberAssignSubmitting={tenantMemberAssignSubmitting}
        tenantMemberAssignSuccessMessage={tenantMemberAssignSuccessMessage}
        tenantMemberAssignErrorMessage={tenantMemberAssignErrorMessage}
        onTenantMemberAssignSubmit={onTenantMemberAssignSubmit}
        clearTenantMemberAssignFeedback={clearTenantMemberAssignFeedback}
        token={token}
      />
      <IndustryTenantCreateSection {...tenantSectionProps} />
    </main>
  )
}
