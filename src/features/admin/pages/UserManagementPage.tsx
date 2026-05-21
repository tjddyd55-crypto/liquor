import { useCallback, useEffect, useState } from 'react'
import { FormDialog, useConfirmDialog } from '../../../components/dialog'
import { EmptyState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormButton, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  deleteAdminUser,
  listAdminUsers,
  listGaCompanies,
  patchAdminUser,
  type AdminUserRow,
  type EntityStatus,
  type GaCompanyRow,
  type UserRole,
} from '../../auth/authApi'

const STATUS_META: Record<EntityStatus, { label: string; fg: string; bg: string }> = {
  active: {
    label: '정상',
    fg: 'var(--success)',
    bg: 'color-mix(in srgb, var(--success) 20%, transparent)',
  },
  blocked: {
    label: '접근금지',
    fg: 'var(--danger)',
    bg: 'color-mix(in srgb, var(--danger) 20%, transparent)',
  },
  inactive: {
    label: '비활성',
    fg: 'var(--text-secondary)',
    bg: 'color-mix(in srgb, var(--text-secondary) 18%, transparent)',
  },
}

const STATUS_SELECT_OPTIONS: { value: EntityStatus; label: string }[] = [
  { value: 'active', label: '정상' },
  { value: 'blocked', label: '접근금지' },
  { value: 'inactive', label: '비활성' },
]

function normalizeUserStatus(s: string | undefined): EntityStatus {
  const v = String(s ?? '').toLowerCase()
  if (v === 'blocked' || v === 'inactive') {
    return v
  }
  return 'active'
}

function StatusBadge({ status }: { status: EntityStatus }) {
  const m = STATUS_META[status]
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: m.fg,
        background: m.bg,
        whiteSpace: 'nowrap',
      }}
    >
      {m.label}
    </span>
  )
}

const EDIT_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'USER', label: 'USER (일반)' },
  { value: 'GA_ADMIN', label: 'GA_ADMIN (GA 관리자)' },
  { value: 'GA_STAFF', label: 'GA_STAFF (직원)' },
  { value: 'SUPER_ADMIN', label: 'SUPER_ADMIN (전체 관리자)' },
]

export default function UserManagementPage() {
  const { user, token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [gaList, setGaList] = useState<GaCompanyRow[]>([])
  const [gaFilter, setGaFilter] = useState<number | 'all'>('all')
  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [editing, setEditing] = useState<AdminUserRow | null>(null)
  const [editGaId, setEditGaId] = useState<number>(0)
  const [editRole, setEditRole] = useState<UserRole>('USER')
  const [editStatus, setEditStatus] = useState<EntityStatus>('active')
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (user?.role !== 'SUPER_ADMIN' || !token?.trim()) {
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const gas = await listGaCompanies(token)
        if (!cancelled) {
          setGaList(gas)
        }
      } catch {
        if (!cancelled) {
          setLoadError('GA 목록을 불러오지 못했습니다.')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.role, token])

  const loadUsers = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    setLoadError('')
    setIsLoading(true)
    try {
      const users = await listAdminUsers(token, gaFilter === 'all' ? undefined : gaFilter)
      setRows(users.map((u) => ({ ...u, status: normalizeUserStatus(u.status as string) })))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '사용자 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role, gaFilter])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const openEdit = (r: AdminUserRow) => {
    setSaveOk('')
    setSaveError('')
    setEditing(r)
    setEditGaId(r.ga_id)
    setEditRole(r.role)
    setEditStatus(normalizeUserStatus(r.status as string))
  }

  const closeEdit = () => {
    if (isSaving) {
      return
    }
    setEditing(null)
    setSaveError('')
  }

  const submitEdit = async () => {
    if (!editing || !token?.trim()) {
      return
    }
    setSaveError('')
    setSaveOk('')
    setIsSaving(true)
    try {
      const updated = await patchAdminUser(token, editing.id, {
        ga_id: editGaId,
        role: editRole,
        status: editStatus,
      })
      setRows((prev) =>
        prev.map((row) =>
          row.id === updated.id
            ? {
                ...row,
                ga_id: updated.ga_id,
                ga_company_name: updated.ga_company_name,
                role: updated.role,
                display_name: updated.display_name,
                status: normalizeUserStatus(updated.status as string),
              }
            : row,
        ),
      )
      setSaveOk('저장되었습니다.')
      setEditing(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const applyUserStatus = async (row: AdminUserRow, status: EntityStatus) => {
    if (!token?.trim()) {
      return
    }
    if (normalizeUserStatus(row.status as string) === status) {
      return
    }
    try {
      const updated = await patchAdminUser(token, row.id, { status })
      setRows((prev) =>
        prev.map((u) =>
          u.id === row.id
            ? { ...u, ...updated, status: normalizeUserStatus(updated.status as string) }
            : u,
        ),
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    }
  }

  const confirmDeleteUser = async (row: AdminUserRow) => {
    if (!token?.trim()) {
      return
    }
    const confirmed = await confirm({
      title: '사용자 삭제',
      message: '해당 사용자를 삭제하시겠습니까?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    try {
      await deleteAdminUser(token, row.id)
      setRows((prev) => prev.filter((u) => u.id !== row.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const renderRowCells = (r: AdminUserRow) => {
    const st = normalizeUserStatus(r.status as string)
    const displayName = String(r.display_name ?? '').trim()
    return (
      <>
        <td>{r.ga_company_name}</td>
        <td>{displayName || '—'}</td>
        <td>{r.username}</td>
        <td>{r.role}</td>
        <td>
          <StatusBadge status={st} />
        </td>
        <td className="admin-table-cell--actions">
          <div className="admin-table-actions">
            <FormSelect
              className="admin-form-input"
              style={{ width: 'auto', minWidth: 100 }}
              value={st}
              onChange={(e) => void applyUserStatus(r, e.target.value as EntityStatus)}
              disabled={isLoading}
              aria-label={`${r.username} 상태 변경`}
              options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            />
            <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => openEdit(r)} disabled={isLoading}>
              수정
            </FormButton>
            <FormButton
              htmlType="button"
              variant="secondary"
              className="button button--secondary"
              onClick={() => void confirmDeleteUser(r)}
              disabled={isLoading}
            >
              삭제
            </FormButton>
          </div>
        </td>
      </>
    )
  }

  const renderUserCard = (r: AdminUserRow) => {
    const st = normalizeUserStatus(r.status as string)
    const displayName = String(r.display_name ?? '').trim()
    return (
      <article key={r.id} className="admin-user-card">
        <div className="admin-user-card__row">
          <span className="admin-user-card__label">GA</span>
          <span className="admin-user-card__value">{r.ga_company_name}</span>
        </div>
        <div className="admin-user-card__row">
          <span className="admin-user-card__label">이름</span>
          <span className="admin-user-card__value">{displayName || '—'}</span>
        </div>
        <div className="admin-user-card__row">
          <span className="admin-user-card__label">아이디</span>
          <span className="admin-user-card__value">{r.username}</span>
        </div>
        <div className="admin-user-card__row">
          <span className="admin-user-card__label">역할</span>
          <span className="admin-user-card__value">{r.role}</span>
        </div>
        <div className="admin-user-card__row">
          <span className="admin-user-card__label">상태</span>
          <span className="admin-user-card__value">
            <StatusBadge status={st} />
          </span>
        </div>
        <div className="admin-user-card__actions">
          <FormSelect
            className="admin-form-input"
            style={{ flex: '1 1 120px', minWidth: 0 }}
            value={st}
            onChange={(e) => void applyUserStatus(r, e.target.value as EntityStatus)}
            disabled={isLoading}
            aria-label={`${r.username} 상태`}
            options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          />
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => openEdit(r)} disabled={isLoading}>
            수정
          </FormButton>
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void confirmDeleteUser(r)} disabled={isLoading}>
            삭제
          </FormButton>
        </div>
      </article>
    )
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>유저 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back admin-user-management">
      <header className="page-header">
        <h1>유저 관리</h1>
        <p>{loadError || saveOk || 'GA별로 사용자를 조회합니다.'}</p>
      </header>

      <section className="admin-toolbar admin-user-management__toolbar card auth-card" style={{ maxWidth: 'none', margin: 0 }}>
        <FieldWrapper label="GA 선택" className="admin-modal-field" >
          <FormSelect
            className="admin-form-input"
            value={gaFilter === 'all' ? '' : String(gaFilter)}
            onChange={(e) => {
              setSaveOk('')
              const v = e.target.value
              setGaFilter(v === '' ? 'all' : Number(v))
            }}
            disabled={isLoading}
            aria-busy={isLoading}
            options={[{ value: '', label: '전체' }, ...gaList.map((g) => ({ value: String(g.id), label: g.name }))]}
          />
        </FieldWrapper>
      </section>

      <div className="card admin-user-management__table-wrap" style={{ maxWidth: 'none', margin: '16px 0 0', padding: 0 }}>
        <div className="table-container table-container--desktop">
          <table className="admin-user-table admin-data-table">
            <thead>
              <tr>
                <th scope="col">GA</th>
                <th scope="col">이름</th>
                <th scope="col">아이디</th>
                <th scope="col">역할</th>
                <th scope="col">상태</th>
                <th scope="col" className="admin-table-cell--actions">
                  관리
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={6} style={{ padding: '20px 14px', color: 'var(--text-sub)' }}>
                    표시할 사용자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => <tr key={r.id}>{renderRowCells(r)}</tr>)
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-responsive-card-list" style={{ padding: 12 }}>
          {rows.length === 0 && !isLoading ? (
            <EmptyState message="표시할 사용자가 없습니다." className="m-0 px-1 py-2 text-[var(--text-sub)]" />
          ) : (
            rows.map((r) => renderUserCard(r))
          )}
        </div>
      </div>

      {editing ? (
        <FormDialog
          open={Boolean(editing)}
          onClose={closeEdit}
          title="유저 수정"
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!isSaving}
          closeOnEsc={!isSaving}
        >
          <div className="admin-modal-content">
            <p style={{ margin: 0, wordBreak: 'break-all', fontSize: 14 }}>
              <strong>{editing.username}</strong>
            </p>
            <StatusMessage message={saveError} tone="error" className="m-0" />
            <FieldWrapper label="GA 회사" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={String(editGaId)}
                onChange={(e) => setEditGaId(Number(e.target.value))}
                disabled={isSaving}
                options={gaList.map((g) => ({ value: String(g.id), label: g.name }))}
              />
            </FieldWrapper>
            <FieldWrapper label="역할" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value as UserRole)}
                disabled={isSaving}
                options={EDIT_ROLE_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </FieldWrapper>
            <FieldWrapper label="상태" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as EntityStatus)}
                disabled={isSaving}
                options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </FieldWrapper>
          </div>
          <div className="admin-modal-actions">
            <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={closeEdit} disabled={isSaving}>
              취소
            </FormButton>
            <FormButton htmlType="button" variant="primary" className="button button--primary" loading={isSaving} loadingText="저장 중…" onClick={() => void submitEdit()}>
              저장
            </FormButton>
          </div>
        </FormDialog>
      ) : null}
      {confirmDialog}
    </main>
  )
}
