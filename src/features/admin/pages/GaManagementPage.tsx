import { type FormEvent, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormDialog, useConfirmDialog } from '../../../components/dialog'
import { EmptyState, LoadingState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import {
  createGaCompany,
  deleteGaCompany,
  listGaCompanyHistory,
  listGaCompanies,
  patchGaCompany,
  type EntityStatus,
  type GaCompanyRow,
  type GaHistoryRow,
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

function normalizeStatus(s: string | undefined): EntityStatus {
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

function formatChangedAt(iso: string): string {
  if (!iso) {
    return '—'
  }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return iso
  }
  return d.toLocaleString('ko-KR', { hour12: false })
}

function formatChangePair(before: string, after: string): string {
  const prev = String(before ?? '').trim()
  const next = String(after ?? '').trim()
  if (prev === next) {
    return `${next || '—'} (변경 없음)`
  }
  return `${prev || '—'} -> ${next || '—'}`
}

export default function GaManagementPage() {
  const { user, token } = useAuth()
  const { confirm, confirmDialog } = useConfirmDialog()
  const [rows, setRows] = useState<GaCompanyRow[]>([])
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createCode, setCreateCode] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createErr, setCreateErr] = useState('')

  const [editing, setEditing] = useState<GaCompanyRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editCode, setEditCode] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editErr, setEditErr] = useState('')
  const [historyTarget, setHistoryTarget] = useState<GaCompanyRow | null>(null)
  const [historyRows, setHistoryRows] = useState<GaHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') {
      return
    }
    setLoadError('')
    setIsLoading(true)
    try {
      const list = await listGaCompanies(token)
      setRows(list.map((r) => ({ ...r, status: normalizeStatus(r.status as string) })))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  const submitCreate = async (e: FormEvent) => {
    e.preventDefault()
    if (!token?.trim()) {
      return
    }
    setCreateErr('')
    setCreateBusy(true)
    try {
      await createGaCompany(token, { name: createName, code: createCode })
      setCreateName('')
      setCreateCode('')
      setCreateOpen(false)
      await load()
    } catch (err) {
      setCreateErr(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setCreateBusy(false)
    }
  }

  const applyStatus = async (row: GaCompanyRow, status: EntityStatus) => {
    if (!token?.trim()) {
      return
    }
    if (normalizeStatus(row.status as string) === status) {
      return
    }
    try {
      const updated = await patchGaCompany(token, row.id, { status })
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id ? { ...r, ...updated, status: normalizeStatus(updated.status as string) } : r,
        ),
      )
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '상태 변경에 실패했습니다.')
    }
  }

  const openEdit = (r: GaCompanyRow) => {
    setEditErr('')
    setEditing(r)
    setEditName(r.name)
    setEditCode(r.code)
  }

  const openHistory = async (r: GaCompanyRow) => {
    if (!token?.trim()) {
      return
    }
    setHistoryTarget(r)
    setHistoryRows([])
    setHistoryError('')
    setHistoryLoading(true)
    try {
      const list = await listGaCompanyHistory(token, r.id)
      setHistoryRows(list)
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : '이력 조회에 실패했습니다.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const submitEdit = async (e: FormEvent) => {
    e.preventDefault()
    if (!editing || !token?.trim()) {
      return
    }
    setEditErr('')
    setEditBusy(true)
    try {
      const updated = await patchGaCompany(token, editing.id, {
        name: editName.trim(),
        code: editCode.trim().toUpperCase(),
      })
      setRows((prev) =>
        prev.map((r) =>
          r.id === editing.id ? { ...r, ...updated, status: normalizeStatus(updated.status as string) } : r,
        ),
      )
      setEditing(null)
    } catch (err) {
      setEditErr(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setEditBusy(false)
    }
  }

  const confirmDelete = async (r: GaCompanyRow) => {
    if (!token?.trim()) {
      return
    }
    const confirmed = await confirm({
      title: 'GA 삭제',
      message: '해당 GA를 삭제하시겠습니까?',
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    try {
      await deleteGaCompany(token, r.id)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : '삭제에 실패했습니다.')
    }
  }

  const renderGaRow = (r: GaCompanyRow) => {
    const st = normalizeStatus(r.status as string)
    return (
      <tr key={r.id}>
        <td>{r.name}</td>
        <td>{r.code}</td>
        <td>
          <StatusBadge status={st} />
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
              aria-label={`${r.name} 상태`}
              options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            />
            <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void openHistory(r)} disabled={isLoading}>
              이력
            </FormButton>
            <Link
              to={`/admin/ga/${r.id}`}
              state={{ name: r.name, code: r.code }}
              className="button button--secondary"
              style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', textDecoration: 'none' }}
            >
              관리
            </Link>
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

  const renderGaCard = (r: GaCompanyRow) => {
    const st = normalizeStatus(r.status as string)
    return (
      <article key={r.id} className="admin-ga-card">
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">GA 이름</span>
          <span className="admin-ga-card__value">{r.name}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">GA 코드</span>
          <span className="admin-ga-card__value">{r.code}</span>
        </div>
        <div className="admin-ga-card__row">
          <span className="admin-ga-card__label">상태</span>
          <span className="admin-ga-card__value">
            <StatusBadge status={st} />
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
            aria-label={`${r.name} 상태`}
            options={STATUS_SELECT_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
          />
          <FormButton htmlType="button" variant="secondary" className="button button--secondary" onClick={() => void openHistory(r)} disabled={isLoading}>
            이력
          </FormButton>
          <Link
            to={`/admin/ga/${r.id}`}
            state={{ name: r.name, code: r.code }}
            className="button button--secondary"
            style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', textDecoration: 'none' }}
          >
            관리
          </Link>
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
          <h1>GA 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  return (
    <main className="page page--with-back admin-ga-management">
      <header className="page-header">
        <h1>GA 관리</h1>
        <p>{loadError || 'GA 회사를 등록·상태·삭제(소프트)할 수 있습니다.'}</p>
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
          GA 등록
        </FormButton>
        {isLoading ? <LoadingState message="불러오는 중…" className="m-0 text-sm text-[var(--text-sub)]" /> : null}
      </section>

      <div className="card admin-ga-management__table-wrap" style={{ maxWidth: 'none', margin: '16px 0 0', padding: 0 }}>
        <div className="table-container table-container--desktop">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>GA 이름</th>
                <th>GA 코드</th>
                <th>상태</th>
                <th>생성일</th>
                <th className="admin-table-cell--actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '20px 14px', color: 'var(--text-sub)' }}>
                    등록된 GA가 없습니다.
                  </td>
                </tr>
              ) : (
                rows.map((r) => renderGaRow(r))
              )}
            </tbody>
          </table>
        </div>

        <div className="admin-responsive-card-list" style={{ padding: 12 }}>
          {rows.length === 0 && !isLoading ? (
            <EmptyState message="등록된 GA가 없습니다." className="m-0 px-1 py-2 text-[var(--text-sub)]" />
          ) : (
            rows.map((r) => renderGaCard(r))
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
          title="GA 등록"
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!createBusy}
          closeOnEsc={!createBusy}
        >
          <form
            className="admin-modal-content"
            onSubmit={submitCreate}
          >
            <StatusMessage message={createErr} tone="error" className="m-0" />
            <FieldWrapper label="GA 이름" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="예: 영진에셋"
                required
                disabled={createBusy}
              />
            </FieldWrapper>
            <FieldWrapper label="GA 코드" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={createCode}
                onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                placeholder="영문 대문자·숫자·밑줄 2~32자"
                required
                disabled={createBusy}
                autoComplete="off"
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
          title="GA 수정"
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!editBusy}
          closeOnEsc={!editBusy}
        >
          <form
            className="admin-modal-content"
            onSubmit={submitEdit}
          >
            <StatusMessage message={editErr} tone="error" className="m-0" />
            <FieldWrapper label="GA 이름" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="GA 이름"
                required
                disabled={editBusy}
              />
            </FieldWrapper>
            <FieldWrapper label="GA 코드" className="admin-modal-field">
              <FormInput
                className="admin-form-input"
                value={editCode}
                onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                placeholder="GA 코드"
                required
                disabled={editBusy}
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
      {historyTarget ? (
        <FormDialog
          open={Boolean(historyTarget)}
          onClose={() => {
            if (!historyLoading) {
              setHistoryTarget(null)
            }
          }}
          title={`GA 변경 이력 (${historyTarget.name})`}
          panelClassName="admin-modal-panel"
          overlayClassName="admin-modal-backdrop"
          closeOnBackdrop={!historyLoading}
          closeOnEsc={!historyLoading}
        >
          <div className="admin-modal-content">
            <StatusMessage message={historyError} tone="error" className="m-0" />
            {historyLoading ? <LoadingState message="이력 불러오는 중…" /> : null}
            {!historyLoading && historyRows.length === 0 ? (
              <EmptyState message="기록된 변경 이력이 없습니다." className="m-0" />
            ) : null}
            {!historyLoading && historyRows.length > 0 ? (
              <div className="table-container">
                <table className="admin-data-table">
                  <thead>
                    <tr>
                      <th>변경 시각</th>
                      <th>코드 변경</th>
                      <th>이름 변경</th>
                      <th>변경자</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyRows.map((row) => (
                      <tr key={row.id}>
                        <td>{formatChangedAt(row.changed_at)}</td>
                        <td>{formatChangePair(row.old_code, row.new_code)}</td>
                        <td>{formatChangePair(row.old_name, row.new_name)}</td>
                        <td>{String(row.changed_by ?? '').trim() || 'system'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="admin-modal-actions">
              <FormButton
                htmlType="button"
                variant="secondary"
                className="button button--secondary"
                onClick={() => setHistoryTarget(null)}
                disabled={historyLoading}
              >
                닫기
              </FormButton>
            </div>
          </div>
        </FormDialog>
      ) : null}
      {confirmDialog}
    </main>
  )
}
