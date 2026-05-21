import FormButton from '../../../../../components/form/FormButton'
import FormInput from '../../../../../components/form/FormInput'
import FormSelect from '../../../../../components/form/FormSelect'
import type { PlatformTenantManageViewProps } from '../../../hooks/usePlatformTenantManageState'

const RBAC_OPTIONS: { value: string; label: string }[] = [
  { value: 'user', label: 'user (설계사/agent 멤버십)' },
  { value: 'staff', label: 'staff' },
  { value: 'tenant_admin', label: 'tenant_admin' },
]

const MEMBERSHIP_TYPES: { value: string; label: string }[] = [
  { value: 'agent', label: 'agent' },
  { value: 'staff', label: 'staff' },
  { value: 'admin', label: 'admin' },
  { value: 'owner', label: 'owner' },
]

const CUSTOMER_ACCESS_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'none' },
  { value: 'own', label: 'own (본인 고객)' },
  { value: 'tenant', label: 'tenant (조직 고객)' },
  { value: 'assigned', label: 'assigned (예약)' },
]

const ACCOUNT_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
  { value: 'blocked', label: 'blocked' },
]

const MEMBERSHIP_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'active', label: 'active' },
  { value: 'inactive', label: 'inactive' },
]

function fmtDt(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('ko-KR')
  } catch {
    return iso
  }
}

export default function PlatformTenantManageMobileView(props: PlatformTenantManageViewProps) {
  const {
    tenantIdValid,
    tenant,
    tenantLoading,
    tenantError,
    registrationCodes,
    codesLoading,
    codesError,
    newRegCode,
    setNewRegCode,
    newRegMaxUses,
    setNewRegMaxUses,
    newRegExpires,
    setNewRegExpires,
    regCreateSubmitting,
    regCreateError,
    onCreateRegistrationCode,
    onDeactivateRegistrationCode,
    staffUsers,
    usersLoading,
    usersError,
    memberEdits,
    onMemberFieldChange,
    onSaveMemberRow,
    memberRowSaving,
    newUserUsername,
    setNewUserUsername,
    newUserDisplayName,
    setNewUserDisplayName,
    newUserPassword,
    setNewUserPassword,
    newUserRbac,
    setNewUserRbac,
    newUserMembershipType,
    setNewUserMembershipType,
    newUserCustomerAccess,
    setNewUserCustomerAccess,
    newUserSubmitting,
    newUserError,
    onCreateStaffUser,
    reloadAll,
  } = props

  return (
    <main className="page platform-admin-page platform-tenant-manage-page platform-tenant-manage-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">Tenant 운영</h1>
        <p className="platform-admin-page__lede">
          가입 코드(MVP는 일반 사용자용 agent/own) · 테넌트 사용자 및 멤버십
        </p>
      </header>

      {!tenantIdValid ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>유효한 테넌트 id가 필요합니다.</p>
        </div>
      ) : null}

      {tenantIdValid && tenantError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{tenantError}</p>
          <button type="button" className="platform-admin-page__btn" onClick={() => reloadAll()}>
            다시 시도
          </button>
        </div>
      ) : null}

      {tenantIdValid && tenantLoading ? <p className="platform-admin-page__muted">테넌트 정보 로드 중…</p> : null}

      {tenantIdValid && !tenantLoading && tenant ? (
        <section className="platform-admin-page__panel" aria-label="테넌트 요약">
          <div className="platform-admin-page__stack-title">{tenant.name}</div>
          <div className="platform-admin-page__stack-meta platform-admin-page__mono">
            code {tenant.code} · tenant id {tenant.id} · industry {tenant.industryCode ?? '—'} · 상태 {tenant.status}
          </div>
          <div className="platform-admin-page__stack-meta platform-admin-page__mono">
            legacy GA id {tenant.legacyGaId ?? '—'}
          </div>
        </section>
      ) : null}

      <section className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide" aria-labelledby="rtc-heading">
        <h2 id="rtc-heading" className="platform-admin-page__subhead">
          가입 코드
        </h2>
        <p className="platform-admin-page__muted">
          생성 시 고정값: membership_type <strong>agent</strong>, customer_access <strong>own</strong>, role{' '}
          <strong>user</strong> (다른 타입 코드는 다음 단계)
        </p>
        {codesError ? (
          <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
            <p>{codesError}</p>
          </div>
        ) : null}
        {codesLoading ? <p className="platform-admin-page__muted">목록 불러오는 중…</p> : null}
        {!codesLoading ? (
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>코드</th>
                <th>상태</th>
                <th>만료</th>
                <th>사용</th>
                <th>max</th>
                <th>업종 코드</th>
                <th>기본 타입/access/role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {registrationCodes.map((c) => (
                <tr key={c.id}>
                  <td className="platform-admin-page__mono">{c.code}</td>
                  <td>{c.status}</td>
                  <td>{fmtDt(c.expiresAt)}</td>
                  <td>{c.usedCount}</td>
                  <td>{c.maxUses == null ? '∞' : String(c.maxUses)}</td>
                  <td className="platform-admin-page__mono">{c.industryCode}</td>
                  <td className="platform-admin-page__mono">
                    {c.defaultMembershipType}/{c.defaultCustomerAccess}/{c.defaultRole}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="platform-admin-page__btn platform-admin-page__btn--compact"
                      disabled={c.status === 'inactive'}
                      onClick={() => void onDeactivateRegistrationCode(c)}
                    >
                      비활성화
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {registrationCodes.length === 0 && !codesLoading ? (
          <p className="platform-admin-page__muted">등록된 코드가 없습니다.</p>
        ) : null}

        <div className="platform-admin-page__panel platform-admin-page__muted" aria-label="가입 코드 생성">
          <h3 className="platform-admin-page__stack-title">코드 생성</h3>
          {regCreateError ? (
            <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
              <p>{regCreateError}</p>
            </div>
          ) : null}
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="rtc-code">
              코드
            </label>
            <FormInput
              id="rtc-code"
              value={newRegCode}
              onChange={(e) => setNewRegCode(e.target.value)}
              autoComplete="off"
              placeholder="예: ACME2026"
              disabled={!tenantIdValid || regCreateSubmitting}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="rtc-max">
              최대 사용 횟수(비워 두면 무제한)
            </label>
            <FormInput
              id="rtc-max"
              inputMode="numeric"
              value={newRegMaxUses}
              onChange={(e) => setNewRegMaxUses(e.target.value)}
              placeholder=""
              disabled={!tenantIdValid || regCreateSubmitting}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="rtc-exp">
              만료(로컬 시각 선택, 비우면 무기한)
            </label>
            <FormInput
              id="rtc-exp"
              type="datetime-local"
              value={newRegExpires}
              onChange={(e) => setNewRegExpires(e.target.value)}
              disabled={!tenantIdValid || regCreateSubmitting}
            />
          </div>
          <FormButton
            htmlType="button"
            variant="primary"
            disabled={!tenantIdValid || regCreateSubmitting}
            loading={regCreateSubmitting}
            onClick={() => void onCreateRegistrationCode()}
          >
            생성
          </FormButton>
        </div>
      </section>

      <section className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide" aria-labelledby="stu-heading">
        <h2 id="stu-heading" className="platform-admin-page__subhead">
          테넌트 사용자
        </h2>
        {usersError ? (
          <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
            <p>{usersError}</p>
          </div>
        ) : null}
        {usersLoading ? <p className="platform-admin-page__muted">목록 불러오는 중…</p> : null}
        {!usersLoading ? (
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>이름</th>
                <th>아이디</th>
                <th>역할(rb)</th>
                <th>memb.type</th>
                <th>customer</th>
                <th>계정</th>
                <th>멤버십</th>
                <th />
                <th />
              </tr>
            </thead>
            <tbody>
              {staffUsers.map((u) => {
                const ed = memberEdits[u.userId]
                const saving = memberRowSaving[u.userId] === true
                return (
                  <tr key={u.membershipId}>
                    <td>{u.displayName ?? '—'}</td>
                    <td className="platform-admin-page__mono">{u.username}</td>
                    <td>
                      {ed ? (
                        <FormSelect
                          aria-label={`${u.username} rbac`}
                          value={ed.rbacRole}
                          disabled={saving || !tenantIdValid}
                          onChange={(e) => onMemberFieldChange(u.userId, 'rbacRole', e.target.value)}
                          options={RBAC_OPTIONS}
                        />
                      ) : null}
                    </td>
                    <td>
                      {ed ? (
                        <FormSelect
                          aria-label={`${u.username} membership type`}
                          value={ed.membershipType}
                          disabled={saving || !tenantIdValid}
                          onChange={(e) => onMemberFieldChange(u.userId, 'membershipType', e.target.value)}
                          options={MEMBERSHIP_TYPES}
                        />
                      ) : null}
                    </td>
                    <td>
                      {ed ? (
                        <FormSelect
                          aria-label={`${u.username} customer access`}
                          value={ed.customerAccess}
                          disabled={saving || !tenantIdValid}
                          onChange={(e) => onMemberFieldChange(u.userId, 'customerAccess', e.target.value)}
                          options={CUSTOMER_ACCESS_OPTIONS}
                        />
                      ) : null}
                    </td>
                    <td>
                      {ed ? (
                        <FormSelect
                          aria-label={`${u.username} account status`}
                          value={ed.userAccountStatus}
                          disabled={saving || !tenantIdValid}
                          onChange={(e) => onMemberFieldChange(u.userId, 'userAccountStatus', e.target.value)}
                          options={ACCOUNT_STATUS_OPTIONS}
                        />
                      ) : null}
                    </td>
                    <td>
                      {ed ? (
                        <FormSelect
                          aria-label={`${u.username} membership status`}
                          value={ed.membershipStatus}
                          disabled={saving || !tenantIdValid}
                          onChange={(e) => onMemberFieldChange(u.userId, 'membershipStatus', e.target.value)}
                          options={MEMBERSHIP_STATUS_OPTIONS}
                        />
                      ) : null}
                    </td>
                    <td>
                      <FormButton
                        htmlType="button"
                        variant="secondary"
                        loading={saving}
                        disabled={!tenantIdValid || saving || !ed}
                        onClick={() => void onSaveMemberRow(u.userId)}
                      >
                        변경 저장
                      </FormButton>
                    </td>
                    <td className="platform-admin-page__muted platform-admin-page__mono">
                      sess {u.activeSessionCount ?? 0}/dev {u.registeredDeviceCount ?? 0}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : null}

        <div className="platform-admin-page__panel" aria-label="스태프 사용자 직접 생성">
          <h3 className="platform-admin-page__stack-title">사용자 직접 생성</h3>
          <p className="platform-admin-page__muted">
            레거시 <code className="platform-admin-page__mono">USER</code> 역할로 생성되며, 실제 업무 역할은 멤버십으로 구분합니다.
          </p>
          {newUserError ? (
            <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
              <p>{newUserError}</p>
            </div>
          ) : null}
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-user">
              로그인 아이디
            </label>
            <FormInput
              id="nu-user"
              value={newUserUsername}
              autoComplete="off"
              onChange={(e) => setNewUserUsername(e.target.value)}
              disabled={!tenantIdValid || newUserSubmitting}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-disp">
              표시 이름
            </label>
            <FormInput
              id="nu-disp"
              value={newUserDisplayName}
              onChange={(e) => setNewUserDisplayName(e.target.value)}
              disabled={!tenantIdValid || newUserSubmitting}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-pass">
              임시 비밀번호
            </label>
            <FormInput
              id="nu-pass"
              type="password"
              autoComplete="new-password"
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              disabled={!tenantIdValid || newUserSubmitting}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-rbac">
              멤버십 rbac
            </label>
            <FormSelect
              id="nu-rbac"
              value={newUserRbac}
              disabled={!tenantIdValid || newUserSubmitting}
              onChange={(e) => setNewUserRbac(e.target.value as 'staff' | 'user' | 'tenant_admin')}
              options={RBAC_OPTIONS}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-mt">
              membershipType
            </label>
            <FormSelect
              id="nu-mt"
              value={newUserMembershipType}
              disabled={!tenantIdValid || newUserSubmitting}
              onChange={(e) => setNewUserMembershipType(e.target.value as 'agent' | 'staff' | 'admin' | 'owner')}
              options={MEMBERSHIP_TYPES}
            />
          </div>
          <div className="platform-admin-page__form-field">
            <label className="dark-label" htmlFor="nu-ca">
              customerAccess
            </label>
            <FormSelect
              id="nu-ca"
              value={newUserCustomerAccess}
              disabled={!tenantIdValid || newUserSubmitting}
              onChange={(e) => setNewUserCustomerAccess(e.target.value as 'none' | 'own' | 'tenant' | 'assigned')}
              options={CUSTOMER_ACCESS_OPTIONS}
            />
          </div>
          <FormButton
            htmlType="button"
            variant="primary"
            disabled={!tenantIdValid || newUserSubmitting}
            loading={newUserSubmitting}
            onClick={() => void onCreateStaffUser()}
          >
            사용자 생성
          </FormButton>
        </div>
      </section>
    </main>
  )
}
