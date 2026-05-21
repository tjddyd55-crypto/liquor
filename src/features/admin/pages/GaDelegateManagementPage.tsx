import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { FormDialog, useConfirmDialog } from '../../../components/dialog'
import { EmptyState, LoadingState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  createGaDelegate,
  deleteAdminUser,
  listGaCompanies,
  listGaDelegates,
  patchGaDelegate,
  type EntityStatus,
  type GaCompanyRow,
  type GaDelegateRole,
  type GaDelegateRow,
} from '../../auth/authApi'

const STATUS_META: Record<string, { label: string; fg: string; bg: string }> = {
  ACTIVE: {
    label: 'ACTIVE',
    fg: 'var(--success)',
    bg: 'color-mix(in srgb, var(--success) 20%, transparent)',
  },
  BLOCKED: {
    label: 'BLOCKED',
    fg: 'var(--danger)',
    bg: 'color-mix(in srgb, var(--danger) 20%, transparent)',
  },
  INACTIVE: {
    label: 'INACTIVE',
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

function StatusBadge({ labelKey }: { labelKey: string }) {
  const m = STATUS_META[labelKey] ?? STATUS_META.ACTIVE
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

function formatCreatedAt(iso: string): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso.slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

function formatDelegateRole(role: GaDelegateRole): string {
  return role === 'GA_ADMIN' ? 'GA_ADMIN' : 'GA_STAFF'
}

export default function GaDelegateManagementPage() {
  const { user, token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [rows, setRows] = useState<GaDelegateRow[]>([])
  const [gaList, setGaList] = useState<GaCompanyRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createGaId, setCreateGaId] = useState<number | ''>('')
  const [createRole, setCreateRole] = useState<GaDelegateRole>('GA_ADMIN')
  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const [editing, setEditing] = useState<GaDelegateRow | null>(null)
  const [editUsername, setEditUsername] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editStatus, setEditStatus] = useState<EntityStatus>('active')
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState('')

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    setLoadError('')
    setIsLoading(true)
    try {
      const [list, gas] = await Promise.all([listGaDelegates(token), listGaCompanies(token)])
      setRows(list)
      setGaList(gas)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!createOpen || gaList.length === 0) {
      return
    }
    if (createGaId === '' && gaList.length === 1) {
      setCreateGaId(gaList[0].id)
    }
  }, [createOpen, gaList, createGaId])

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim()) {
      return
    }
    if (createGaId === '' || !Number.isInteger(Number(createGaId))) {
      setCreateErr('GA를 선택하세요.')
      return
    }
    setCreateErr('')
    setCreateBusy(true)
    try {
      const row = await createGaDelegate(token, {
        gaId: Number(createGaId),
        username: createUsername,
        password: createPassword,
        name: createName,
        role: createRole,
      })
      setRows((prev) => [...prev, row].sort((a, b) => a.gaName.localeCompare(b.gaName) || a.username.localeCompare(b.username)))
      setCreateGaId('')
      setCreateUsername('')
      setCreatePassword('')
      setCreateName('')
      setCreateOpen(false)
      await load()
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setCreateBusy(false)
    }
  }

  const applyStatus = async (row: GaDelegateRow, status: EntityStatus) => {
    if (!token?.trim()) {
      return
    }
    if (normalizeUserStatus(row.status) === status) {
      return
    }
    try {
      const updated = await patchGaDelegate(token, row.id, { status })
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...updated, status: normalizeUserStatus(updated.status) } : r)),
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    }
  }

  const openEdit = (r: GaDelegateRow) => {
    setEditErr('')
    setEditing(r)
    setEditUsername(r.username)
    setEditPassword('')
    setEditStatus(normalizeUserStatus(r.status))
  }

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !token?.trim()) {
      return
    }
    setEditErr('')
    setEditBusy(true)
    try {
      const updated = await patchGaDelegate(token, editing.id, {
        username: editUsername.trim(),
        ...(editPassword.trim() !== '' ? { password: editPassword } : {}),
        status: editStatus,
      })
      setRows((prev) =>
        prev.map((row) => (row.id === editing.id ? { ...row, ...updated, status: normalizeUserStatus(updated.status) } : row)),
      )
      setEditing(null)
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setEditBusy(false)
    }
  }

  const confirmDelete = async (r: GaDelegateRow) => {
    if (!token?.trim()) {
      return
    }
    const confirmed = await confirm({
      title: '담당자 삭제',
      message: '해당 담당자 계정을 삭제하시겠습니까?',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    try {
      await deleteAdminUser(token, r.id)
      setRows((prev) => prev.filter((x) => x.id !== r.id))
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const renderRow = (r: GaDelegateRow) => {
    const st = normalizeUserStatus(r.status)
    const pw = String(r.password ?? '').trim()
    return (
      <tr key={r.id}>
        <td>{r.gaName}</td>
        <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.username}</td>
        <td>{formatDelegateRole(r.role)}</td>
        <td style={{ wordBreak: 'break-all' }}>{pw || '—'}</td>
        <td>
          <StatusBadge labelKey={r.statusLabel} />
        </td>
        <td>{formatCreatedAt(r.created_at)}</td>
        <td className="admin-table-cell--actions">
          <div className="admin-table-actions">
            <FormSelect
              className="admin-form-input"
              style={{ width: 'auto', minWidth: 100 }}
              value={st}
              onChange={(e) => void applyStatus(r, e.target.value as EntityStatus)}
              disabled={isLoading}
              aria-label={`${r.username} 상태`}
              options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            />
            <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => openEdit(r)} disabled={isLoading}>
              수정
            </FormButton>
            <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void confirmDelete(r)} disabled={isLoading}>
              삭제
            </FormButton>
          </div>
        </td>
      </tr>
    )
  }

  const renderCard = (r: GaDelegateRow) => {
    const st = normalizeUserStatus(r.status)
    const pw = String(r.password ?? '').trim()
    return (
      <article key={r.id} className="admin-ga-card">
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">GA 이름</span>
          <span className="admin-ga-card__value">{r.gaName}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">아이디</span>
          <span className="admin-ga-card__value">{r.username}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">역할</span>
          <span className="admin-ga-card__value">{formatDelegateRole(r.role)}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">비밀번호</span>
          <span className="admin-ga-card__value">{pw || '—'}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">상태</span>
          <span className="admin-ga-card__value">
            <StatusBadge labelKey={r.statusLabel} />
          </span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">생성일</span>
          <span className="admin-ga-card__value">{formatCreatedAt(r.created_at)}</span>
        </div>
        <div className="admin-ga-card__actions">
          <FormSelect
            className="admin-form-input"
            style={{ flex: '1 1 120px', minWidth: 0 }}
            value={st}
            onChange={(e) => void applyStatus(r, e.target.value as EntityStatus)}
            disabled={isLoading}
            options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          />
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => openEdit(r)} disabled={isLoading}>
            수정
          </FormButton>
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void confirmDelete(r)} disabled={isLoading}>
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
          <h1>담당자 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back admin-ga-management">
      <header className="page-header">
        <h1>담당자 관리</h1>
        <p>{loadError || '전체 GA의 GA_ADMIN · GA_STAFF 계정을 관리합니다.'}</p>
      </header>

      <section
        className="admin-toolbar admin-ga-management__toolbar card auth-card"
        style={{ maxWidth: 'none', margin: 0, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
      >
        <FormButton
          htmlType="button"
          variant="primary"
          className="button button--primary"
          onClick={() => {
            setCreateErr('')
            setCreateOpen(true)
          }}
          disabled={isLoading}
        >
          등록
        </FormButton>
        {isLoading ? <LoadingState message="불러오는 중…" className="m-0 text-sm text-[var(--text-sub)]" /> : null}
      </section>

      <div className="card admin-ga-management__table-wrap" style={{ maxWidth: 'none', margin: '16px 0 0', padding: 0 }}>
        <div className="table-container table-container--desktop">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>GA 이름</th>
                <th>아이디</th>
                <th>역할</th>
                <th>비밀번호</th>
                <th>상태</th>
                <th>생성일</th>
                <th className="admin-table-cell--actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '20px 14px', color: 'var(--text-sub)' }}>
                    등록된 담당자가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => renderRow(r))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-responsive-card-list" style={{ padding: 12 }}>
          {rows.length === 0 && !isLoading ? (
            <EmptyState message="등록된 담당자가 없습니다." className="m-0 px-1 py-2 text-[var(--text-sub)]" />
          ) : (
            rows.map((r) => renderCard(r))
          )}
        </div>
      </div>

      {createOpen ? (
        <FormDialog
          open={createOpen}
          onClose={() => {
            if (!createBusy) {
              setCreateOpen(false)
            }
          }}
          title="담당자 등록"
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!createBusy}
          closeOnEsc={!createBusy}
        >
          <form
            className="admin-modal-content"
            onSubmit={(e) => void submitCreate(e)}
          >
            <StatusMessage message={createErr} tone="error" className="m-0" />
            <FieldWrapper label="GA 선택" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={createGaId === '' ? '' : String(createGaId)}
                onChange={(e) => setCreateGaId(e.target.value === '' ? '' : Number(e.target.value))}
                required
                disabled={createBusy}
                options={[
                  { value: '', label: '선택하세요' },
                  ...gaList.map((g) => ({ value: String(g.id), label: `${g.name} (${g.code})` })),
                ]}
              />
            </FieldWrapper>
            <FieldWrapper label="역할" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={createRole}
                onChange={(e) => setCreateRole(e.target.value as GaDelegateRole)}
                disabled={createBusy}
                options={[
                  { value: 'GA_ADMIN', label: 'GA_ADMIN' },
                  { value: 'GA_STAFF', label: 'GA_STAFF' },
                ]}
              />
            </FieldWrapper>
            <FieldWrapper label="아이디" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={createUsername}
                onChange={(e) => setCreateUsername(e.target.value)}
                required
                disabled={createBusy}
                autoComplete="off"
              />
            </FieldWrapper>
            <FieldWrapper label="비밀번호" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                type="text"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                disabled={createBusy}
                autoComplete="off"
              />
            </FieldWrapper>
            <FieldWrapper label="이름 (표시용, 선택)" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                disabled={createBusy}
                autoComplete="name"
              />
            </FieldWrapper>
            <div className="admin-modal-actions">
              <FormButton htmlType="button" variant="secondary" className="button button--secondary" disabled={createBusy} onClick={() => setCreateOpen(false)}>
                취소
              </FormButton>
              <FormButton htmlType="submit" variant="primary" className="button button--primary" loading={createBusy} loadingText="저장 중…">
                저장
              </FormButton>
            </div>
          </form>
        </FormDialog>
      ) : null}

      {editing ? (
        <FormDialog
          open={Boolean(editing)}
          onClose={() => {
            if (!editBusy) {
              setEditing(null)
            }
          }}
          title="담당자 수정"
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!editBusy}
          closeOnEsc={!editBusy}
        >
          <form
            className="admin-modal-content"
            onSubmit={(e) => void submitEdit(e)}
          >
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-sub)' }}>
              GA: <strong>{editing.gaName}</strong> · 역할: {editing.role}
            </p>
            <StatusMessage message={editErr} tone="error" className="m-0" />
            <FieldWrapper label="아이디" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                required
                disabled={editBusy}
                autoComplete="off"
              />
            </FieldWrapper>
            <FieldWrapper label="비밀번호" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                type="text"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                disabled={editBusy}
                autoComplete="off"
                placeholder="비워 두면 유지"
              />
            </FieldWrapper>
            <FieldWrapper label="상태" className="admin-modal-field">
              <FormSelect
                className="admin-form-input"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as EntityStatus)}
                disabled={editBusy}
                options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
              />
            </FieldWrapper>
            <div className="admin-modal-actions">
              <FormButton htmlType="button" variant="secondary" className="button button--secondary" disabled={editBusy} onClick={() => setEditing(null)}>
                취소
              </FormButton>
              <FormButton htmlType="submit" variant="primary" className="button button--primary" loading={editBusy} loadingText="저장 중…">
                저장
              </FormButton>
            </div>
          </form>
        </FormDialog>
      ) : null}
      {confirmDialog}
    </main>
  )
}
