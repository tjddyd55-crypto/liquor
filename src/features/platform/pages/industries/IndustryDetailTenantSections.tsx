import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import FormButton from '../../../../components/form/FormButton'
import FormInput from '../../../../components/form/FormInput'
import FormSelect from '../../../../components/form/FormSelect'
import { PlatformUserSearchSelect } from '../../components/PlatformUserSearchSelect'
import type { PlatformTenantAdminMember, PlatformTenantMember, PlatformTenantRow } from '../../platformAdmin.types'
import { IndustryTenantCrmTemplateSection } from './IndustryTenantCrmTemplateSection'

const TENANT_STATUS_OPTIONS = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
] as const

const TENANT_MEMBER_ROLE_OPTIONS: { value: 'staff' | 'user'; label: string }[] = [
  { value: 'staff', label: 'staff' },
  { value: 'user', label: 'user' },
]

export type IndustryDetailTenantSectionsProps = {
  variant: 'pc' | 'mobile'
  industryRowPresent: boolean
  tenants: PlatformTenantRow[]
  tenantsLoading: boolean
  tenantsError: string | null
  onRetryTenants: () => void
  canCreateTenant: boolean
  industryInactive: boolean
  tenantCreateCode: string
  setTenantCreateCode: (v: string) => void
  tenantCreateName: string
  setTenantCreateName: (v: string) => void
  tenantCreateStatus: 'active' | 'inactive'
  setTenantCreateStatus: (v: 'active' | 'inactive') => void
  tenantCreateLegacyGaId: string
  setTenantCreateLegacyGaId: (v: string) => void
  tenantCreateSubmitting: boolean
  tenantCreateSuccessMessage: string | null
  tenantCreateErrorMessage: string | null
  onTenantCreateSubmit: (e: FormEvent<HTMLFormElement>) => void
  clearTenantCreateFeedback: () => void
  tenantAdminTargetTenantId: string | null
  openTenantAdminManage: (tenantId: string) => void
  tenantAdminPanelEnabled: boolean
}

function isTenantActiveForAdmin(row: PlatformTenantRow): boolean {
  return String(row.status ?? '').trim().toLowerCase() === 'active'
}

export function IndustryTenantsListSection({
  variant,
  industryRowPresent,
  tenants,
  tenantsLoading,
  tenantsError,
  onRetryTenants,
  tenantAdminTargetTenantId,
  openTenantAdminManage,
  tenantAdminPanelEnabled,
}: Pick<
  IndustryDetailTenantSectionsProps,
  | 'variant'
  | 'industryRowPresent'
  | 'tenants'
  | 'tenantsLoading'
  | 'tenantsError'
  | 'onRetryTenants'
  | 'tenantAdminTargetTenantId'
  | 'openTenantAdminManage'
  | 'tenantAdminPanelEnabled'
>) {
  if (!industryRowPresent) {
    return null
  }

  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId = variant === 'pc' ? 'tenants-list-heading' : 'm-tenants-list'

  return (
    <section
      className={
        variant === 'pc'
          ? 'platform-admin-page__table-wrap platform-admin-page__table-wrap--wide'
          : undefined
      }
      aria-labelledby={titleId}
    >
      <h2 id={titleId} className={titleClass}>
        Tenant 목록
      </h2>
      {tenantsError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantsError}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => void onRetryTenants()}>
            다시 시도
          </button>
        </div>
      ) : null}
      {tenantsLoading ? <p className="platform-admin-page__muted">Tenant 목록을 불러오는 중…</p> : null}
      {variant === 'pc' && !tenantsLoading && !tenantsError ? (
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>id</th>
              <th>code</th>
              <th>name</th>
              <th>status</th>
              <th>활성/계약 좌석</th>
              <th>남은 좌석</th>
              <th>legacyGaId</th>
              <th>createdAt</th>
              <th>updatedAt</th>
              <th aria-label="가입 코드 및 사용자 관리">가입 코드·사용자</th>
              <th aria-label="Tenant Admin 관리">Tenant Admin</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((row) => (
              <tr
                key={row.id}
                className={
                  tenantAdminPanelEnabled &&
                  tenantAdminTargetTenantId !== null &&
                  row.id === tenantAdminTargetTenantId
                    ? 'platform-admin-page__table-row--tenant-admin-selected'
                    : undefined
                }
              >
                <td className="platform-admin-page__mono">{row.id}</td>
                <td className="platform-admin-page__mono">{row.code}</td>
                <td>{row.name}</td>
                <td>{row.status}</td>
                <td className="platform-admin-page__mono">
                  {row.activeSeatCount ?? 0} /{' '}
                  {row.seatLimit == null || row.seatLimit === undefined ? '∞' : row.seatLimit}
                </td>
                <td>
                  {row.seatLimit == null || row.seatLimit === undefined
                    ? '—'
                    : String(row.remainingSeats ?? 0)}
                </td>
                <td className="platform-admin-page__mono">{row.legacyGaId ?? '—'}</td>
                <td className="platform-admin-page__muted">{row.createdAt ?? '—'}</td>
                <td className="platform-admin-page__muted">{row.updatedAt ?? '—'}</td>
                <td>
                  {isTenantActiveForAdmin(row) ? (
                    <Link
                      className="platform-admin-page__btn platform-admin-page__btn--compact"
                      to={`/admin/platform/tenants/${encodeURIComponent(row.id)}`}
                    >
                      가입 코드·사용자
                    </Link>
                  ) : (
                    <span className="platform-admin-page__muted">—</span>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    className="platform-admin-page__btn platform-admin-page__btn--compact"
                    title={
                      isTenantActiveForAdmin(row)
                        ? 'Tenant Admin 목록 및 지정'
                        : 'inactive 테넌트는 관리할 수 없습니다.'
                    }
                    disabled={
                      !tenantAdminPanelEnabled ||
                      tenantsLoading ||
                      tenantsError !== null ||
                      !isTenantActiveForAdmin(row)
                    }
                    onClick={() => openTenantAdminManage(row.id)}
                  >
                    관리
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {variant === 'mobile' && !tenantsLoading && !tenantsError ? (
        <ul className="platform-admin-page__card-list">
          {tenants.map((row) => (
            <li
              key={row.id}
              className={`platform-admin-page__stack-card${
                tenantAdminPanelEnabled &&
                tenantAdminTargetTenantId !== null &&
                row.id === tenantAdminTargetTenantId
                  ? ' platform-admin-page__stack-card--tenant-admin-selected'
                  : ''
              }`}
            >
              <div className="platform-admin-page__stack-title">{row.name}</div>
              <div className="platform-admin-page__stack-meta platform-admin-page__mono">{row.code}</div>
              <div className="platform-admin-page__stack-meta">
                id {row.id} · status {row.status}
              </div>
              <div className="platform-admin-page__stack-meta">
                좌석: 활성 {row.activeSeatCount ?? 0}
                {' / 계약 '}
                {row.seatLimit == null || row.seatLimit === undefined
                  ? '무제한'
                  : `${row.seatLimit} · 남은 ${row.remainingSeats ?? 0}`}
              </div>
              <div className="platform-admin-page__stack-meta platform-admin-page__mono">
                legacyGaId {row.legacyGaId ?? '—'}
              </div>
              <div className="platform-admin-page__stack-meta">
                {row.createdAt ?? '—'} → {row.updatedAt ?? '—'}
              </div>
              <div className="platform-admin-page__tenant-admin-card-actions">
                {isTenantActiveForAdmin(row) ? (
                  <Link
                    className="platform-admin-page__btn platform-admin-page__btn--compact"
                    to={`/admin/platform/tenants/${encodeURIComponent(row.id)}`}
                  >
                    가입 코드·사용자
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="platform-admin-page__btn platform-admin-page__btn--compact"
                  title={
                    isTenantActiveForAdmin(row)
                      ? 'Tenant Admin 목록 및 지정'
                      : 'inactive 테넌트는 관리할 수 없습니다.'
                  }
                  disabled={
                    !tenantAdminPanelEnabled ||
                    tenantsLoading ||
                    tenantsError !== null ||
                    !isTenantActiveForAdmin(row)
                  }
                  onClick={() => openTenantAdminManage(row.id)}
                >
                  Tenant Admin 관리
                </button>
                {!isTenantActiveForAdmin(row) ? (
                  <span className="platform-admin-page__muted platform-admin-page__tenant-admin-note">
                    inactive 테넌트는 관리할 수 없습니다.
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {!tenantsLoading && !tenantsError && tenants.length === 0 ? (
        <p className="platform-admin-page__muted">이 업종에 등록된 Tenant 가 없습니다.</p>
      ) : null}
    </section>
  )
}

export function IndustryTenantCreateSection(props: IndustryDetailTenantSectionsProps) {
  const {
    variant,
    industryRowPresent,
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
  } = props

  if (!industryRowPresent) {
    return null
  }

  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId = variant === 'pc' ? 'tenant-create-heading' : 'm-tenant-create'
  const codeId = variant === 'pc' ? 'platform-tenant-create-code' : 'platform-tenant-create-code-m'
  const nameId = variant === 'pc' ? 'platform-tenant-create-name' : 'platform-tenant-create-name-m'
  const gaId =
    variant === 'pc' ? 'platform-tenant-create-legacy-ga' : 'platform-tenant-create-legacy-ga-m'
  const statusId =
    variant === 'pc' ? 'platform-tenant-create-status' : 'platform-tenant-create-status-m'

  return (
    <section className="platform-admin-page__industry-create" aria-labelledby={titleId}>
      <h2 id={titleId} className={titleClass}>
        Tenant 생성
      </h2>
      {industryInactive ? (
        <p className="platform-admin-page__muted" role="status">
          비활성(inactive) 업종에서는 새 Tenant 를 생성할 수 없습니다.
        </p>
      ) : null}

      {tenantCreateSuccessMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
          <p>{tenantCreateSuccessMessage}</p>
        </div>
      ) : null}

      {tenantCreateErrorMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantCreateErrorMessage}</p>
        </div>
      ) : null}

      {canCreateTenant ? (
        <form className="platform-admin-page__industry-create-form" onSubmit={onTenantCreateSubmit}>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={codeId}>
              code <span className="platform-admin-page__required">*</span>
            </label>
            <p className="platform-admin-page__field-hint">
              저장 시 <strong>소문자로 정규화</strong>됩니다. 영문 소문자 또는 숫자로 시작하고, 이후 영문
              소문자·숫자·`_`·`-` 만 허용됩니다 (최대 64자). <code className="platform-admin-page__mono">yjasset</code>{' '}
              은 예약 코드입니다.
            </p>
            <FormInput
              id={codeId}
              name="code"
              autoComplete="off"
              value={tenantCreateCode}
              onChange={(e) => {
                clearTenantCreateFeedback()
                setTenantCreateCode(e.target.value)
              }}
              disabled={tenantCreateSubmitting}
              placeholder="예: acme_insurance"
            />
          </div>

          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={nameId}>
              name <span className="platform-admin-page__required">*</span>
            </label>
            <p className="platform-admin-page__field-hint">1~200자</p>
            <FormInput
              id={nameId}
              name="name"
              autoComplete="off"
              value={tenantCreateName}
              onChange={(e) => {
                clearTenantCreateFeedback()
                setTenantCreateName(e.target.value)
              }}
              disabled={tenantCreateSubmitting}
            />
          </div>

          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={statusId}>
              status
            </label>
            <FormSelect
              id={statusId}
              name="status"
              value={tenantCreateStatus}
              disabled={tenantCreateSubmitting}
              options={[...TENANT_STATUS_OPTIONS]}
              onChange={(e) => {
                clearTenantCreateFeedback()
                const v = e.target.value === 'inactive' ? 'inactive' : 'active'
                setTenantCreateStatus(v)
              }}
            />
          </div>

          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={gaId}>
              legacyGaId (선택)
            </label>
            <p className="platform-admin-page__field-hint">비워 두면 생략됩니다. 입력 시 양의 정수.</p>
            <FormInput
              id={gaId}
              name="legacyGaId"
              autoComplete="off"
              inputMode="numeric"
              value={tenantCreateLegacyGaId}
              onChange={(e) => {
                clearTenantCreateFeedback()
                setTenantCreateLegacyGaId(e.target.value)
              }}
              disabled={tenantCreateSubmitting}
              placeholder=""
            />
          </div>

          <div className="platform-admin-page__form-actions">
            <FormButton
              htmlType="submit"
              variant="primary"
              loading={tenantCreateSubmitting}
              loadingText="생성 중…"
              disabled={tenantCreateSubmitting}
              fullWidth={variant === 'mobile'}
            >
              Tenant 생성
            </FormButton>
          </div>
        </form>
      ) : (
        !industryInactive ? (
          <p className="platform-admin-page__muted">업종 정보를 불러온 뒤 Tenant 를 생성할 수 있습니다.</p>
        ) : null
      )}
    </section>
  )
}

export type IndustryTenantAdminManageSectionProps = {
  variant: 'pc' | 'mobile'
  industryRowPresent: boolean
  tenantAdminTargetTenantId: string | null
  selectedTenant: PlatformTenantRow | null
  tenantAdmins: PlatformTenantAdminMember[]
  tenantAdminsLoading: boolean
  tenantAdminsError: string | null
  refetchTenantAdmins: () => Promise<void>
  tenantAssignUserId: string
  setTenantAssignUserId: (v: string) => void
  tenantAssignSubmitting: boolean
  tenantAssignSuccessMessage: string | null
  tenantAssignErrorMessage: string | null
  onTenantAdminAssignSubmit: (e: FormEvent<HTMLFormElement>) => void
  clearTenantAdminAssignFeedback: () => void
  closeTenantAdminManage: () => void
  token: string | null
  refetchTenants: () => void | Promise<void>
}

export function IndustryTenantAdminManageSection({
  variant,
  industryRowPresent,
  tenantAdminTargetTenantId,
  selectedTenant,
  tenantAdmins,
  tenantAdminsLoading,
  tenantAdminsError,
  refetchTenantAdmins,
  tenantAssignUserId,
  setTenantAssignUserId,
  tenantAssignSubmitting,
  tenantAssignSuccessMessage,
  tenantAssignErrorMessage,
  onTenantAdminAssignSubmit,
  clearTenantAdminAssignFeedback,
  closeTenantAdminManage,
  token,
  refetchTenants,
}: IndustryTenantAdminManageSectionProps) {
  if (!industryRowPresent || tenantAdminTargetTenantId == null) {
    return null
  }

  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId =
    variant === 'pc' ? 'platform-tenant-admin-manage-heading' : 'm-platform-tenant-admin-manage'
  const userIdFieldId =
    variant === 'pc' ? 'platform-tenant-admin-user-id' : 'platform-tenant-admin-user-id-m'

  return (
    <section className="platform-admin-page__tenant-admin-manage" aria-labelledby={titleId}>
      <div className="platform-admin-page__tenant-admin-manage-head">
        <h2 id={titleId} className={titleClass}>
          Tenant Admin 관리
        </h2>
        <button type="button" className="platform-admin-page__btn" onClick={closeTenantAdminManage}>
          닫기
        </button>
      </div>

      {selectedTenant == null ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>
            테넌트 id <span className="platform-admin-page__mono">{tenantAdminTargetTenantId}</span> 를 현재
            업종 목록에서 찾을 수 없습니다. Tenant 목록을 새로고침한 뒤 다시 선택해 주세요.
          </p>
        </div>
      ) : (
        <div className="platform-admin-page__summary-card platform-admin-page__tenant-admin-summary">
          <h3 className="platform-admin-page__panel-title">선택한 Tenant</h3>
          <dl className="platform-admin-page__dl">
            <dt>id</dt>
            <dd className="platform-admin-page__mono">{selectedTenant.id}</dd>
            <dt>code</dt>
            <dd className="platform-admin-page__mono">{selectedTenant.code}</dd>
            <dt>name</dt>
            <dd>{selectedTenant.name}</dd>
            <dt>status</dt>
            <dd>{selectedTenant.status}</dd>
            <dt>legacyGaId</dt>
            <dd className="platform-admin-page__mono">{selectedTenant.legacyGaId ?? '—'}</dd>
          </dl>
        </div>
      )}

      {selectedTenant != null ? (
        <IndustryTenantCrmTemplateSection
          variant={variant}
          token={token}
          selectedTenant={selectedTenant}
          refetchTenants={refetchTenants}
        />
      ) : null}

      {tenantAdminsError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantAdminsError}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => void refetchTenantAdmins()}>
            목록 다시 시도
          </button>
        </div>
      ) : null}

      {tenantAdminsLoading ? (
        <p className="platform-admin-page__muted">Tenant Admin 목록을 불러오는 중…</p>
      ) : null}

      {selectedTenant != null && !tenantAdminsLoading && !tenantAdminsError ? (
        <>
          {variant === 'pc' ? (
            <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
              <h3 className="platform-admin-page__panel-title">Tenant Admin 목록</h3>
              <table className="platform-admin-page__table platform-admin-page__table--compact">
                <thead>
                  <tr>
                    <th>membershipId</th>
                    <th>userId</th>
                    <th>username</th>
                    <th>legacyRole</th>
                    <th>membershipRole</th>
                    <th>status</th>
                    <th>createdAt</th>
                    <th>updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantAdmins.map((row) => (
                    <tr key={row.membershipId}>
                      <td className="platform-admin-page__mono">{row.membershipId}</td>
                      <td className="platform-admin-page__mono">{row.userId}</td>
                      <td>{row.username}</td>
                      <td>{row.legacyRole}</td>
                      <td>{row.membershipRole}</td>
                      <td>{row.status}</td>
                      <td className="platform-admin-page__muted">{row.createdAt ?? '—'}</td>
                      <td className="platform-admin-page__muted">{row.updatedAt ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenantAdmins.length === 0 ? (
                <p className="platform-admin-page__muted">등록된 Tenant Admin 이 없습니다.</p>
              ) : null}
            </div>
          ) : (
            <div className="platform-admin-page__tenant-admin-mobile-list">
              <h3 className="platform-admin-page__stack-title">Tenant Admin 목록</h3>
              {tenantAdmins.length === 0 ? (
                <p className="platform-admin-page__muted">등록된 Tenant Admin 이 없습니다.</p>
              ) : (
                <ul className="platform-admin-page__card-list">
                  {tenantAdmins.map((row) => (
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
              )}
            </div>
          )}
        </>
      ) : null}

      {tenantAssignSuccessMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
          <p>{tenantAssignSuccessMessage}</p>
        </div>
      ) : null}

      {tenantAssignErrorMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantAssignErrorMessage}</p>
        </div>
      ) : null}

      {selectedTenant != null ? (
        <form className="platform-admin-page__industry-create-form" onSubmit={onTenantAdminAssignSubmit}>
          <h3 className="platform-admin-page__panel-title">
            Tenant Admin 지정{' '}
            <span className="platform-admin-page__muted">(tenant {selectedTenant.code})</span>
          </h3>
          <PlatformUserSearchSelect
            token={token}
            userIdValue={tenantAssignUserId}
            setUserId={setTenantAssignUserId}
            variant={variant}
            disabled={tenantAssignSubmitting}
            searchInputId={`${userIdFieldId}-search`}
            onInteract={clearTenantAdminAssignFeedback}
          />
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={userIdFieldId}>
              userId <span className="platform-admin-page__required">*</span>
            </label>
            <p className="platform-admin-page__field-hint">검색으로 선택했거나 users.id(UUID)를 직접 입력합니다.</p>
            <FormInput
              id={userIdFieldId}
              name="tenantAdminUserId"
              autoComplete="off"
              value={tenantAssignUserId}
              onChange={(e) => {
                clearTenantAdminAssignFeedback()
                setTenantAssignUserId(e.target.value)
              }}
              disabled={tenantAssignSubmitting}
              placeholder="users.id (UUID)"
            />
          </div>
          <div className="platform-admin-page__form-actions">
            <FormButton
              htmlType="submit"
              variant="primary"
              loading={tenantAssignSubmitting}
              loadingText="지정 중…"
              disabled={tenantAssignSubmitting}
              fullWidth={variant === 'mobile'}
            >
              Tenant Admin 지정
            </FormButton>
          </div>
        </form>
      ) : null}
    </section>
  )
}

export type IndustryTenantStaffUserManageSectionProps = {
  variant: 'pc' | 'mobile'
  industryRowPresent: boolean
  tenantAdminTargetTenantId: string | null
  selectedTenant: PlatformTenantRow | null
  tenantMembers: PlatformTenantMember[]
  tenantMembersLoading: boolean
  tenantMembersError: string | null
  refetchTenantMembers: () => Promise<void>
  tenantMemberAssignUserId: string
  setTenantMemberAssignUserId: (v: string) => void
  tenantMemberAssignRole: 'staff' | 'user'
  setTenantMemberAssignRole: (v: 'staff' | 'user') => void
  tenantMemberAssignSubmitting: boolean
  tenantMemberAssignSuccessMessage: string | null
  tenantMemberAssignErrorMessage: string | null
  onTenantMemberAssignSubmit: (e: FormEvent<HTMLFormElement>) => void
  clearTenantMemberAssignFeedback: () => void
  token: string | null
}

export function IndustryTenantStaffUserManageSection({
  variant,
  industryRowPresent,
  tenantAdminTargetTenantId,
  selectedTenant,
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
}: IndustryTenantStaffUserManageSectionProps) {
  if (!industryRowPresent || tenantAdminTargetTenantId == null) {
    return null
  }

  const titleClass =
    variant === 'pc' ? 'platform-admin-page__subhead' : 'platform-admin-page__stack-title'
  const titleId =
    variant === 'pc'
      ? 'platform-tenant-staff-user-manage-heading'
      : 'm-platform-tenant-staff-user-manage'
  const userIdFieldId =
    variant === 'pc' ? 'platform-tenant-member-user-id' : 'platform-tenant-member-user-id-m'
  const roleFieldId =
    variant === 'pc' ? 'platform-tenant-member-role' : 'platform-tenant-member-role-m'

  return (
    <section className="platform-admin-page__tenant-members-manage" aria-labelledby={titleId}>
      <h2 id={titleId} className={titleClass}>
        Staff / User 멤버 관리
      </h2>

      {selectedTenant == null ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--warn" role="status">
          <p>
            테넌트 id <span className="platform-admin-page__mono">{tenantAdminTargetTenantId}</span> 를 현재
            업종 목록에서 찾을 수 없습니다. Tenant 목록을 새로고침한 뒤 다시 선택해 주세요.
          </p>
        </div>
      ) : (
        <div className="platform-admin-page__summary-card platform-admin-page__tenant-admin-summary">
          <h3 className="platform-admin-page__panel-title">선택한 Tenant</h3>
          <dl className="platform-admin-page__dl">
            <dt>id</dt>
            <dd className="platform-admin-page__mono">{selectedTenant.id}</dd>
            <dt>code</dt>
            <dd className="platform-admin-page__mono">{selectedTenant.code}</dd>
            <dt>name</dt>
            <dd>{selectedTenant.name}</dd>
            <dt>status</dt>
            <dd>{selectedTenant.status}</dd>
            <dt>좌석</dt>
            <dd>
              활성 {selectedTenant.activeSeatCount ?? 0}
              {selectedTenant.seatLimit == null || selectedTenant.seatLimit === undefined
                ? ' · 계약 무제한'
                : ` · 계약 ${selectedTenant.seatLimit} · 남은 ${selectedTenant.remainingSeats ?? 0}`}
            </dd>
          </dl>
        </div>
      )}

      {tenantMembersError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantMembersError}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => void refetchTenantMembers()}>
            목록 다시 시도
          </button>
        </div>
      ) : null}

      {tenantMembersLoading ? (
        <p className="platform-admin-page__muted">Staff/User 멤버 목록을 불러오는 중…</p>
      ) : null}

      {selectedTenant != null && !tenantMembersLoading && !tenantMembersError ? (
        <>
          {variant === 'pc' ? (
            <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
              <h3 className="platform-admin-page__panel-title">Staff / User 멤버 목록</h3>
              <table className="platform-admin-page__table platform-admin-page__table--compact">
                <thead>
                  <tr>
                    <th>membershipId</th>
                    <th>userId</th>
                    <th>username</th>
                    <th>displayName</th>
                    <th>legacyRole</th>
                    <th>membershipRole</th>
                    <th>계정 상태</th>
                    <th>membership 상태</th>
                    <th>마지막 로그인</th>
                    <th>IP</th>
                    <th>세션 수</th>
                    <th>기기 수</th>
                    <th>createdAt</th>
                    <th>updatedAt</th>
                  </tr>
                </thead>
                <tbody>
                  {tenantMembers.map((row) => (
                    <tr key={row.membershipId}>
                      <td className="platform-admin-page__mono">{row.membershipId}</td>
                      <td className="platform-admin-page__mono">{row.userId}</td>
                      <td>{row.username}</td>
                      <td>{row.displayName ?? '—'}</td>
                      <td>{row.legacyRole}</td>
                      <td>{row.membershipRole}</td>
                      <td>{row.userAccountStatus ?? '—'}</td>
                      <td>{row.status}</td>
                      <td className="platform-admin-page__muted">{row.lastLoginAt ?? '—'}</td>
                      <td className="platform-admin-page__mono">{row.lastLoginIp ?? '—'}</td>
                      <td>{row.activeSessionCount ?? 0}</td>
                      <td>{row.registeredDeviceCount ?? 0}</td>
                      <td className="platform-admin-page__muted">{row.createdAt ?? '—'}</td>
                      <td className="platform-admin-page__muted">{row.updatedAt ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenantMembers.length === 0 ? (
                <p className="platform-admin-page__muted">등록된 Staff/User 멤버가 없습니다.</p>
              ) : null}
            </div>
          ) : (
            <div className="platform-admin-page__tenant-admin-mobile-list">
              <h3 className="platform-admin-page__stack-title">Staff / User 멤버 목록</h3>
              {tenantMembers.length === 0 ? (
                <p className="platform-admin-page__muted">등록된 Staff/User 멤버가 없습니다.</p>
              ) : (
                <ul className="platform-admin-page__card-list">
                  {tenantMembers.map((row) => (
                    <li key={row.membershipId} className="platform-admin-page__stack-card">
                      <div className="platform-admin-page__stack-title">{row.username}</div>
                      <div className="platform-admin-page__stack-meta">{row.displayName ?? '—'}</div>
                      <div className="platform-admin-page__stack-meta platform-admin-page__mono">{row.userId}</div>
                      <div className="platform-admin-page__stack-meta">
                        계정 {row.userAccountStatus ?? '—'} · 멤버십 {row.status}
                      </div>
                      <div className="platform-admin-page__stack-meta">
                        세션 {row.activeSessionCount ?? 0} · 기기 {row.registeredDeviceCount ?? 0} · 최근 IP{' '}
                        {row.lastLoginIp ?? '—'}
                      </div>
                      <div className="platform-admin-page__stack-meta platform-admin-page__muted">
                        마지막 로그인 {row.lastLoginAt ?? '—'}
                      </div>
                      <div className="platform-admin-page__stack-meta platform-admin-page__mono">
                        membership {row.membershipId}
                      </div>
                      <div className="platform-admin-page__stack-meta platform-admin-page__muted">
                        {row.legacyRole} · {row.membershipRole}
                      </div>
                      <div className="platform-admin-page__stack-meta">
                        {row.createdAt ?? '—'} → {row.updatedAt ?? '—'}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      ) : null}

      {tenantMemberAssignSuccessMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--success" role="status">
          <p>{tenantMemberAssignSuccessMessage}</p>
        </div>
      ) : null}

      {tenantMemberAssignErrorMessage ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantMemberAssignErrorMessage}</p>
        </div>
      ) : null}

      {selectedTenant != null ? (
        <form className="platform-admin-page__industry-create-form" onSubmit={onTenantMemberAssignSubmit}>
          <h3 className="platform-admin-page__panel-title">
            Staff 또는 User 로 지정{' '}
            <span className="platform-admin-page__muted">(tenant {selectedTenant.code})</span>
          </h3>
          <PlatformUserSearchSelect
            token={token}
            userIdValue={tenantMemberAssignUserId}
            setUserId={setTenantMemberAssignUserId}
            variant={variant}
            disabled={tenantMemberAssignSubmitting}
            searchInputId={`${userIdFieldId}-search`}
            onInteract={clearTenantMemberAssignFeedback}
          />
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={roleFieldId}>
              membershipRole <span className="platform-admin-page__required">*</span>
            </label>
            <FormSelect
              id={roleFieldId}
              name="tenantMemberMembershipRole"
              value={tenantMemberAssignRole}
              disabled={tenantMemberAssignSubmitting}
              options={TENANT_MEMBER_ROLE_OPTIONS}
              onChange={(e) => {
                clearTenantMemberAssignFeedback()
                const v = e.target.value === 'user' ? 'user' : 'staff'
                setTenantMemberAssignRole(v)
              }}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor={userIdFieldId}>
              userId <span className="platform-admin-page__required">*</span>
            </label>
            <p className="platform-admin-page__field-hint">검색으로 선택했거나 users.id(UUID)를 직접 입력합니다.</p>
            <FormInput
              id={userIdFieldId}
              name="tenantStaffUserMemberUserId"
              autoComplete="off"
              value={tenantMemberAssignUserId}
              onChange={(e) => {
                clearTenantMemberAssignFeedback()
                setTenantMemberAssignUserId(e.target.value)
              }}
              disabled={tenantMemberAssignSubmitting}
              placeholder="users.id (UUID)"
            />
          </div>
          <div className="platform-admin-page__form-actions">
            <FormButton
              htmlType="submit"
              variant="primary"
              loading={tenantMemberAssignSubmitting}
              loadingText="지정 중…"
              disabled={tenantMemberAssignSubmitting}
              fullWidth={variant === 'mobile'}
            >
              멤버 지정
            </FormButton>
          </div>
        </form>
      ) : null}
    </section>
  )
}
