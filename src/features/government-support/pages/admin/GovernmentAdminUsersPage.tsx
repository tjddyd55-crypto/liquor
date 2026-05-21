import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormDialog, useConfirmDialog } from '../../../../components/dialog'
import { EmptyState, LoadingState, StatusMessage } from '../../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import {
  createGovernmentAdminUser,
  fetchGovernmentAdminUsers,
  patchGovernmentAdminUser,
  resetGovernmentAdminUserPassword,
} from '../../api/governmentAdminUsersApi'
import { fetchGovAgencies } from '../../api/governmentProfilesApi'
import {
  GOVERNMENT_MEMBERSHIP_ROLES,
  GOVERNMENT_ROLE_LABELS,
  GOVERNMENT_STAFF_MANAGEABLE_ROLES,
  type GovernmentMembershipRole,
  type GovernmentStaffManageableRole,
} from '../../constants/governmentRoles'
import { useGovernmentAccess } from '../../hooks/useGovernmentAccess'
import GovernmentAdminPageShell from '../../components/GovernmentAdminPageShell'
import type { GovAgencyRow } from '../../types/governmentProfile.types'
import type {
  GovernmentAdminUserRow,
  GovernmentUserEntityStatus,
} from '../../types/governmentAdminUser.types'
import '../../government-support.css'

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '상태 전체' },
  { value: 'active', label: '정상' },
  { value: 'blocked', label: '접근금지' },
  { value: 'inactive', label: '비활성' },
]

const STATUS_EDIT_OPTIONS = STATUS_FILTER_OPTIONS.filter((o) => o.value !== '')

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ko-KR')
}

function tenantLabel(row: GovernmentAdminUserRow): string {
  if (row.role === 'government_industry_admin') return '전체(업종 관리자)'
  if (row.tenantName) return row.tenantName
  if (row.agencyCode) return row.agencyCode
  return '—'
}

function roleOptionsForManager(isFullAccess: boolean): { value: GovernmentStaffManageableRole; label: string }[] {
  const roles = isFullAccess
    ? GOVERNMENT_STAFF_MANAGEABLE_ROLES
    : (['government_agency_admin', 'government_staff'] as const)
  return roles.map((r) => ({ value: r, label: GOVERNMENT_ROLE_LABELS[r] }))
}

function roleFilterOptions(): { value: string; label: string }[] {
  return [
    { value: '', label: '역할 전체' },
    ...GOVERNMENT_MEMBERSHIP_ROLES.filter((r) => r !== 'government_user').map((r) => ({
      value: r,
      label: GOVERNMENT_ROLE_LABELS[r],
    })),
  ]
}

export default function GovernmentAdminUsersPage() {
  const { token } = useAuth()
  const { summary } = useGovernmentAccess(token)
  const { confirm, confirmDialog } = useConfirmDialog()

  const isFullAccess = Boolean(summary?.isSuperAdmin || summary?.isGovernmentIndustryAdmin)
  const staffRoleOptions = useMemo(() => roleOptionsForManager(isFullAccess), [isFullAccess])
  const filterRoleOptions = useMemo(() => roleFilterOptions(), [])

  const [agencies, setAgencies] = useState<GovAgencyRow[]>([])
  const [rows, setRows] = useState<GovernmentAdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const [filterRole, setFilterRole] = useState('')
  const [filterTenant, setFilterTenant] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterQ, setFilterQ] = useState('')

  const [createOpen, setCreateOpen] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState<GovernmentStaffManageableRole>('government_staff')
  const [createTenantId, setCreateTenantId] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSaving, setCreateSaving] = useState(false)

  const [editing, setEditing] = useState<GovernmentAdminUserRow | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editRole, setEditRole] = useState<GovernmentStaffManageableRole>('government_staff')
  const [editTenantId, setEditTenantId] = useState('')
  const [editStatus, setEditStatus] = useState<GovernmentUserEntityStatus>('active')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)

  const [resetTarget, setResetTarget] = useState<GovernmentAdminUserRow | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetSaving, setResetSaving] = useState(false)

  const tenantFilterOptions = useMemo(
    () => [
      { value: '', label: '소속 전체' },
      ...agencies.map((a) => ({ value: a.id, label: `${a.name} (${a.agencyCode})` })),
    ],
    [agencies],
  )

  const agencySelectOptions = useMemo(
    () => agencies.map((a) => ({ value: a.id, label: `${a.name} (${a.agencyCode})` })),
    [agencies],
  )

  const loadAgencies = useCallback(async () => {
    if (!token) return
    try {
      const list = await fetchGovAgencies(token)
      setAgencies(list)
      if (list.length === 1) {
        setCreateTenantId(list[0].id)
      }
    } catch {
      setAgencies([])
    }
  }, [token])

  const loadUsers = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    try {
      let list = await fetchGovernmentAdminUsers(token, {
        role: filterRole || undefined,
        tenantId: filterTenant || undefined,
        status: filterStatus || undefined,
        q: filterQ.trim() || undefined,
      })
      if (!filterRole) {
        list = list.filter((r) => r.role !== 'government_user')
      }
      setRows(list)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '사용자 목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, filterRole, filterTenant, filterStatus, filterQ])

  useEffect(() => {
    void loadAgencies()
  }, [loadAgencies])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const openCreate = () => {
    setCreateError(null)
    setCreateUsername('')
    setCreateDisplayName('')
    setCreatePassword('')
    setCreateRole('government_staff')
    setCreateTenantId(agencies[0]?.id ?? '')
    setCreateOpen(true)
  }

  const submitCreate = async () => {
    if (!token) return
    setCreateError(null)
    setCreateSaving(true)
    try {
      await createGovernmentAdminUser(token, {
        username: createUsername.trim(),
        password: createPassword,
        displayName: createDisplayName.trim(),
        role: createRole,
        ...(createRole !== 'government_industry_admin' && createTenantId
          ? { tenantId: createTenantId }
          : {}),
      })
      setCreateOpen(false)
      setSuccessMsg('사용자를 추가했습니다.')
      await loadUsers()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '사용자 추가에 실패했습니다.')
    } finally {
      setCreateSaving(false)
    }
  }

  const openEdit = (row: GovernmentAdminUserRow) => {
    setEditError(null)
    setEditing(row)
    setEditDisplayName(row.displayName)
    setEditRole(
      row.role === 'government_user'
        ? 'government_staff'
        : (row.role as GovernmentStaffManageableRole),
    )
    setEditTenantId(row.tenantId ?? '')
    setEditStatus(row.status)
  }

  const editingIsProgramUser = editing?.role === 'government_user'
  const editRoleLocked = editingIsProgramUser && !isFullAccess

  const submitEdit = async () => {
    if (!token || !editing) return
    setEditError(null)
    setEditSaving(true)
    try {
      const updated = await patchGovernmentAdminUser(token, editing.id, {
        displayName: editDisplayName.trim(),
        status: editStatus,
        ...(!editRoleLocked
          ? {
              role: editRole,
              ...(editRole !== 'government_industry_admin' && editTenantId
                ? { tenantId: editTenantId }
                : {}),
            }
          : {}),
      })
      setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      setEditing(null)
      setSuccessMsg('저장되었습니다.')
    } catch (e) {
      setEditError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setEditSaving(false)
    }
  }

  const openReset = (row: GovernmentAdminUserRow) => {
    setResetError(null)
    setResetPassword('')
    setResetTarget(row)
  }

  const submitReset = async () => {
    if (!token || !resetTarget) return
    const ok = await confirm({
      title: '비밀번호 초기화',
      message: `${resetTarget.username} 사용자의 비밀번호를 변경하시겠습니까?`,
      tone: 'danger',
    })
    if (!ok) return
    setResetError(null)
    setResetSaving(true)
    try {
      await resetGovernmentAdminUserPassword(token, resetTarget.id, resetPassword)
      setResetTarget(null)
      setSuccessMsg('비밀번호가 변경되었습니다. 새 비밀번호로 로그인할 수 있습니다.')
    } catch (e) {
      setResetError(e instanceof Error ? e.message : '비밀번호 변경에 실패했습니다.')
    } finally {
      setResetSaving(false)
    }
  }

  const createNeedsTenant = createRole !== 'government_industry_admin'
  const editNeedsTenant = editRole !== 'government_industry_admin'

  return (
    <GovernmentAdminPageShell
      title="직원 관리"
      description={
        <>
          대행사 직원·관리자 계정만 이 화면에서 추가합니다. 프로그램 이용자는{' '}
          <Link to="/government/admin/program-users" className="dark-link">
            이용자 관리
          </Link>
          에서 확인하세요.
        </>
      }
      toolbar={
        <>
          <FormButton htmlType="button" variant="primary" className="button button--primary" onClick={openCreate}>
            직원 추가
          </FormButton>
          <FieldWrapper label="검색">
            <FormInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="아이디·이름" />
          </FieldWrapper>
          <FieldWrapper label="권한">
            <FormSelect
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              options={filterRoleOptions}
            />
          </FieldWrapper>
          <FieldWrapper label="소속">
            <FormSelect
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
              options={tenantFilterOptions}
            />
          </FieldWrapper>
          <FieldWrapper label="상태">
            <FormSelect
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              options={STATUS_FILTER_OPTIONS}
            />
          </FieldWrapper>
        </>
      }
    >
      {loadError ? <p style={{ padding: '12px 16px', color: 'var(--danger)' }}>{loadError}</p> : null}
      {successMsg ? <p style={{ padding: '12px 16px', color: 'var(--success)' }}>{successMsg}</p> : null}
      {loading ? <LoadingState message="불러오는 중…" /> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState message="등록된 사용자가 없습니다.「사용자 추가」로 첫 사용자를 등록하세요." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <UsersTable rows={rows} onEdit={openEdit} onReset={openReset} />
      ) : null}

      <FormDialog
        open={createOpen}
        onClose={() => !createSaving && setCreateOpen(false)}
        title="사용자 추가"
        closeOnBackdrop={false}
        closeOnEsc={!createSaving}
      >
        <StatusMessage message={createError} tone="error" className="m-0 mb-3" />
        <UsersCreateForm
          createUsername={createUsername}
          setCreateUsername={setCreateUsername}
          createDisplayName={createDisplayName}
          setCreateDisplayName={setCreateDisplayName}
          createPassword={createPassword}
          setCreatePassword={setCreatePassword}
          createRole={createRole}
          setCreateRole={setCreateRole}
          createTenantId={createTenantId}
          setCreateTenantId={setCreateTenantId}
          createNeedsTenant={createNeedsTenant}
          roleOptions={staffRoleOptions}
          agencySelectOptions={agencySelectOptions}
        />
        <DialogActions
          onCancel={() => setCreateOpen(false)}
          onSubmit={() => void submitCreate()}
          saving={createSaving}
          submitLabel="추가"
        />
      </FormDialog>

      {editing ? (
        <FormDialog
          open
          onClose={() => !editSaving && setEditing(null)}
          title="사용자 수정"
          closeOnBackdrop={false}
          closeOnEsc={!editSaving}
        >
          <StatusMessage message={editError} tone="error" className="m-0 mb-3" />
          <p className="government-page__muted government-admin-users-page__username">{editing.username}</p>
          <UsersEditForm
            editDisplayName={editDisplayName}
            setEditDisplayName={setEditDisplayName}
            editRole={editRole}
            setEditRole={setEditRole}
            editTenantId={editTenantId}
            setEditTenantId={setEditTenantId}
            editStatus={editStatus}
            setEditStatus={setEditStatus}
            editNeedsTenant={editNeedsTenant}
            roleOptions={staffRoleOptions}
            roleSelectDisabled={editRoleLocked}
            agencySelectOptions={agencySelectOptions}
          />
          <DialogActions
            onCancel={() => setEditing(null)}
            onSubmit={() => void submitEdit()}
            saving={editSaving}
            submitLabel="저장"
          />
        </FormDialog>
      ) : null}

      {resetTarget ? (
        <FormDialog
          open
          onClose={() => !resetSaving && setResetTarget(null)}
          title="비밀번호 초기화"
          closeOnBackdrop={false}
          closeOnEsc={!resetSaving}
        >
          <StatusMessage message={resetError} tone="error" className="m-0 mb-3" />
          <p className="government-page__muted">
            <strong>{resetTarget.username}</strong> 사용자의 새 비밀번호를 입력하세요.
          </p>
          <FormInput
            label="새 비밀번호"
            type="password"
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            autoComplete="new-password"
          />
          <DialogActions
            onCancel={() => setResetTarget(null)}
            onSubmit={() => void submitReset()}
            saving={resetSaving}
            submitLabel="변경"
          />
        </FormDialog>
      ) : null}

      {confirmDialog}
    </GovernmentAdminPageShell>
  )
}

function DialogActions(props: {
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
  submitLabel: string
}) {
  return (
    <div className="government-admin-users-page__dialog-actions">
      <FormButton htmlType="button" variant="secondary" onClick={props.onCancel} disabled={props.saving}>
        취소
      </FormButton>
      <FormButton
        htmlType="button"
        variant="primary"
        loading={props.saving}
        loadingText="처리 중…"
        onClick={props.onSubmit}
      >
        {props.submitLabel}
      </FormButton>
    </div>
  )
}

function UsersCreateForm(props: {
  createUsername: string
  setCreateUsername: (v: string) => void
  createDisplayName: string
  setCreateDisplayName: (v: string) => void
  createPassword: string
  setCreatePassword: (v: string) => void
  createRole: GovernmentStaffManageableRole
  setCreateRole: (v: GovernmentStaffManageableRole) => void
  createTenantId: string
  setCreateTenantId: (v: string) => void
  createNeedsTenant: boolean
  roleOptions: { value: GovernmentStaffManageableRole; label: string }[]
  agencySelectOptions: { value: string; label: string }[]
}) {
  return (
    <div className="government-form-grid">
      <FormInput label="아이디" value={props.createUsername} onChange={(e) => props.setCreateUsername(e.target.value)} />
      <FormInput label="이름" value={props.createDisplayName} onChange={(e) => props.setCreateDisplayName(e.target.value)} />
      <FormInput
        label="초기 비밀번호"
        type="password"
        value={props.createPassword}
        onChange={(e) => props.setCreatePassword(e.target.value)}
        autoComplete="new-password"
      />
      <FieldWrapper label="권한">
        <FormSelect
          value={props.createRole}
          onChange={(e) => props.setCreateRole(e.target.value as GovernmentStaffManageableRole)}
          options={props.roleOptions}
        />
      </FieldWrapper>
      {props.createNeedsTenant && props.agencySelectOptions.length > 0 ? (
        <FieldWrapper label="소속 수행기관/대행사">
          <FormSelect
            value={props.createTenantId}
            onChange={(e) => props.setCreateTenantId(e.target.value)}
            options={props.agencySelectOptions}
          />
        </FieldWrapper>
      ) : null}
    </div>
  )
}


function UsersEditForm(props: {
  editDisplayName: string
  setEditDisplayName: (v: string) => void
  editRole: GovernmentStaffManageableRole
  setEditRole: (v: GovernmentStaffManageableRole) => void
  editTenantId: string
  setEditTenantId: (v: string) => void
  editStatus: GovernmentUserEntityStatus
  setEditStatus: (v: GovernmentUserEntityStatus) => void
  editNeedsTenant: boolean
  roleSelectDisabled?: boolean
  roleOptions: { value: GovernmentStaffManageableRole; label: string }[]
  agencySelectOptions: { value: string; label: string }[]
}) {
  return (
    <div className="government-form-grid">
      <FormInput label="이름" value={props.editDisplayName} onChange={(e) => props.setEditDisplayName(e.target.value)} />
      <FieldWrapper label="권한">
        <FormSelect
          value={props.editRole}
          onChange={(e) => props.setEditRole(e.target.value as GovernmentStaffManageableRole)}
          options={props.roleOptions}
          disabled={props.roleSelectDisabled}
        />
        {props.roleSelectDisabled ? (
          <p className="government-page__muted" style={{ marginTop: '0.35rem' }}>
            이용자 권한은 기관 코드 가입으로만 부여됩니다.
          </p>
        ) : null}
      </FieldWrapper>
      {props.editNeedsTenant && props.agencySelectOptions.length > 0 ? (
        <FieldWrapper label="소속">
          <FormSelect
            value={props.editTenantId}
            onChange={(e) => props.setEditTenantId(e.target.value)}
            options={props.agencySelectOptions}
          />
        </FieldWrapper>
      ) : null}
      <FieldWrapper label="상태">
        <FormSelect
          value={props.editStatus}
          onChange={(e) => props.setEditStatus(e.target.value as GovernmentUserEntityStatus)}
          options={STATUS_EDIT_OPTIONS}
        />
      </FieldWrapper>
    </div>
  )
}

function UsersTable(props: {
  rows: GovernmentAdminUserRow[]
  onEdit: (row: GovernmentAdminUserRow) => void
  onReset: (row: GovernmentAdminUserRow) => void
}) {
  return (
    <>
      <div className="table-container table-container--desktop">
        <table className="admin-data-table">
          <thead>
            <tr>
              <th>아이디</th>
              <th>이름</th>
              <th>권한</th>
              <th>소속</th>
              <th>상태</th>
              <th>등록일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.id}>
                <td>{r.username}</td>
                <td>{r.displayName || '—'}</td>
                <td>{GOVERNMENT_ROLE_LABELS[r.role] ?? r.role}</td>
                <td>{tenantLabel(r)}</td>
                <td>{r.status}</td>
                <td>{formatDate(r.createdAt)}</td>
                <td>
                  <UserRowActions row={r} onEdit={props.onEdit} onReset={props.onReset} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="government-admin-users-page__cards">
        {props.rows.map((r) => (
          <UserMobileCard key={r.id} row={r} onEdit={props.onEdit} onReset={props.onReset} />
        ))}
      </div>
    </>
  )
}

function UserRowActions(props: {
  row: GovernmentAdminUserRow
  onEdit: (row: GovernmentAdminUserRow) => void
  onReset: (row: GovernmentAdminUserRow) => void
}) {
  return (
    <div className="government-admin-users-page__actions">
      <FormButton htmlType="button" variant="secondary" onClick={() => props.onEdit(props.row)}>
        수정
      </FormButton>
      <FormButton htmlType="button" variant="secondary" onClick={() => props.onReset(props.row)}>
        비밀번호
      </FormButton>
    </div>
  )
}

function UserMobileCard(props: {
  row: GovernmentAdminUserRow
  onEdit: (row: GovernmentAdminUserRow) => void
  onReset: (row: GovernmentAdminUserRow) => void
}) {
  const r = props.row
  return (
    <article className="government-admin-users-page__card">
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">아이디</span>
        <span>{r.username}</span>
      </div>
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">이름</span>
        <span>{r.displayName || '—'}</span>
      </div>
      <GovernmentAdminUsersCardMeta row={r} />
      <UserRowActions row={r} onEdit={props.onEdit} onReset={props.onReset} />
    </article>
  )
}

function GovernmentAdminUsersCardMeta({ row: r }: { row: GovernmentAdminUserRow }) {
  return (
    <>
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">권한</span>
        <span>{GOVERNMENT_ROLE_LABELS[r.role] ?? r.role}</span>
      </div>
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">소속</span>
        <span>{tenantLabel(r)}</span>
      </div>
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">상태</span>
        <span>{r.status}</span>
      </div>
      <div className="government-admin-users-page__card-row">
        <span className="government-admin-users-page__card-label">등록일</span>
        <span>{formatDate(r.createdAt)}</span>
      </div>
    </>
  )
}

