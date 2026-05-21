/**
 * 구독 유저 관리 페이지 (SUPER_ADMIN 전용)
 *
 * 책임:
 *  - 구독 주체 유저(GA_ADMIN / GA_STAFF / USER) 목록을 필터·페이지로 본다.
 *  - 체크박스로 선택 후 `SubscriptionBulkToolbar` 로 일괄 변경.
 *  - 개별 행의 "편집" 으로 `SubscriptionEditDialog` 를 열어 단건 변경.
 *
 * 정책 상태(policyActive) 가 false 면 모두가 FREE 로 간주되지만, 이 화면은 항상 DB 의
 * 원본 plan 을 보여준다 (재활성화 대비). 단, effectiveStatus 배지는 policyActive 까지
 * 감안한 서버 계산값을 그대로 쓴다.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FieldWrapper, FormButton, FormInput, FormSelect } from '../../../components/form'
import { EmptyState, StatusMessage } from '../../../components/feedback'
import { useAuth } from '../../auth/AuthProvider'
import { listGaCompanies, type GaCompanyRow } from '../../auth/authApi'
import {
  bulkUpdateSubscriptionUsers,
  fetchSubscriptionUsers,
  updateSubscriptionUser,
  type BulkSubscriptionAction,
  type SubscriptionUserListFilters,
  type SubscriptionUserRow,
  type UpdateSubscriptionUserBody,
} from '../api/subscriptionAdminApi'
import { PLAN_LABEL, STATUS_LABEL } from '../../subscription/copy'
import { SUBSCRIPTION_PLAN_KEYS } from '../../subscription/policy'
import { SubscriptionBulkToolbar } from '../components/SubscriptionBulkToolbar'
import { SubscriptionEditDialog } from '../components/SubscriptionEditDialog'

const PAGE_SIZE = 20

const PLAN_OPTIONS = [
  { value: '', label: '전체 플랜' },
  ...SUBSCRIPTION_PLAN_KEYS.map((p) => ({ value: p, label: `${p} (${PLAN_LABEL[p]})` })),
]

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'ACTIVE', label: STATUS_LABEL.ACTIVE },
  { value: 'EXPIRED', label: STATUS_LABEL.EXPIRED },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

function remainingLabel(row: SubscriptionUserRow): string {
  if (row.plan === 'FREE') return '∞'
  if (row.effective_status === 'EXPIRED') return '만료'
  if (row.remaining_days == null) return '—'
  return `${row.remaining_days}일`
}

export default function SubscriptionUsersPage() {
  const { user, token } = useAuth()
  const [gaList, setGaList] = useState<GaCompanyRow[]>([])
  const [rows, setRows] = useState<SubscriptionUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [policyActive, setPolicyActive] = useState<boolean | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editTarget, setEditTarget] = useState<SubscriptionUserRow | null>(null)
  const [actionNotice, setActionNotice] = useState('')

  const [gaFilter, setGaFilter] = useState<number | ''>('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [nearExpiry, setNearExpiry] = useState(false)
  const [expiredOnly, setExpiredOnly] = useState(false)
  const [keyword, setKeyword] = useState('')

  const filters: SubscriptionUserListFilters = useMemo(
    () => ({
      gaId: gaFilter === '' ? null : gaFilter,
      plan: planFilter ? (planFilter as SubscriptionUserListFilters['plan']) : null,
      status: statusFilter ? (statusFilter as SubscriptionUserListFilters['status']) : null,
      nearExpiry,
      nearDays: 7,
      expiredOnly,
      keyword: keyword.trim(),
      page,
      pageSize: PAGE_SIZE,
    }),
    [gaFilter, planFilter, statusFilter, nearExpiry, expiredOnly, keyword, page],
  )

  const load = useCallback(async () => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') return
    setLoadError('')
    setIsLoading(true)
    try {
      const res = await fetchSubscriptionUsers(token, filters)
      setRows(res.users)
      setTotal(res.total)
      setPolicyActive(res.policy_active)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '유저 목록을 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [token, user?.role, filters])

  useEffect(() => {
    if (!token?.trim() || user?.role !== 'SUPER_ADMIN') return
    let cancelled = false
    ;(async () => {
      try {
        const gas = await listGaCompanies(token)
        if (!cancelled) setGaList(gas)
      } catch {
        // GA 로드 실패해도 페이지는 사용 가능 — 필터만 비활성.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [token, user?.role])

  useEffect(() => {
    void load()
  }, [load])

  const clearSelection = () => setSelected(new Set())

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const all = rows.every((r) => prev.has(r.id))
      const next = new Set(prev)
      if (all) {
        rows.forEach((r) => next.delete(r.id))
      } else {
        rows.forEach((r) => next.add(r.id))
      }
      return next
    })
  }

  const handleSingleUpdate = async (patch: UpdateSubscriptionUserBody) => {
    if (!token?.trim() || !editTarget) return
    await updateSubscriptionUser(token, editTarget.id, patch)
    setActionNotice(`${editTarget.display_name ?? editTarget.username} 변경 완료.`)
    await load()
  }

  const handleBulk = async (action: BulkSubscriptionAction) => {
    if (!token?.trim() || selected.size === 0) return
    const userIds = Array.from(selected)
    const res = await bulkUpdateSubscriptionUsers(token, userIds, action)
    setActionNotice(`일괄 적용 완료: ${res.affected}명`)
    setSelected(new Set())
    await load()
  }

  if (user?.role !== 'SUPER_ADMIN') {
    return (
      <main className="page page--with-back">
        <header className="page-header">
          <h1>구독 유저 관리</h1>
          <p>전체 관리자만 접근할 수 있습니다.</p>
        </header>
      </main>
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>구독 유저 관리</h1>
        <p>
          구독 주체 유저 목록을 필터·일괄 작업으로 관리합니다.
          {policyActive === false ? ' (현재 정책 비활성 — 모두 FREE 로 간주)' : ''}
        </p>
      </header>

      <section
        className="card auth-card"
        style={{ maxWidth: 'none', margin: '0 0 12px', padding: 12, display: 'grid', gap: 12 }}
      >
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          }}
        >
          <FieldWrapper label="GA">
            <FormSelect
              value={gaFilter === '' ? '' : String(gaFilter)}
              onChange={(e) => {
                setPage(1)
                const v = e.target.value
                setGaFilter(v === '' ? '' : Number(v))
              }}
              options={[
                { value: '', label: '전체' },
                ...gaList.map((g) => ({ value: String(g.id), label: g.name })),
              ]}
            />
          </FieldWrapper>
          <FieldWrapper label="플랜">
            <FormSelect
              value={planFilter}
              onChange={(e) => {
                setPage(1)
                setPlanFilter(e.target.value)
              }}
              options={PLAN_OPTIONS}
            />
          </FieldWrapper>
          <FieldWrapper label="유효 상태">
            <FormSelect
              value={statusFilter}
              onChange={(e) => {
                setPage(1)
                setStatusFilter(e.target.value)
              }}
              options={STATUS_OPTIONS}
            />
          </FieldWrapper>
          <FieldWrapper label="검색 (이름/아이디)">
            <FormInput
              value={keyword}
              onChange={(e) => {
                setPage(1)
                setKeyword(e.target.value)
              }}
              placeholder="홍길동 / user01"
            />
          </FieldWrapper>
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={nearExpiry}
              onChange={(e) => {
                setPage(1)
                setNearExpiry(e.target.checked)
              }}
            />
            <span>만료 임박 (7일 이내)</span>
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={expiredOnly}
              onChange={(e) => {
                setPage(1)
                setExpiredOnly(e.target.checked)
              }}
            />
            <span>만료 유저만</span>
          </label>
          <FormButton htmlType="button" variant="secondary" onClick={() => void load()} disabled={isLoading}>
            새로고침
          </FormButton>
        </div>
      </section>

      <SubscriptionBulkToolbar
        selectedCount={selected.size}
        onExecute={handleBulk}
        onClearSelection={clearSelection}
        disabled={isLoading}
      />

      {actionNotice ? <StatusMessage message={actionNotice} /> : null}
      {loadError ? <StatusMessage tone="error" message={loadError} /> : null}

      <div className="card" style={{ maxWidth: 'none', margin: '12px 0 0', padding: 0 }}>
        <div className="table-container table-container--desktop" style={{ overflowX: 'auto' }}>
          <table className="admin-data-table" style={{ width: '100%', minWidth: 960 }}>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allOnPageSelected}
                    onChange={toggleSelectAllOnPage}
                    aria-label="현재 페이지 전체 선택"
                  />
                </th>
                <th>GA</th>
                <th>이름</th>
                <th>아이디</th>
                <th>역할</th>
                <th>플랜</th>
                <th>상태</th>
                <th>시작일</th>
                <th>만료일</th>
                <th>남은</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !isLoading ? (
                <tr>
                  <td colSpan={11}>
                    <EmptyState message="조건에 맞는 유저가 없습니다." />
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      aria-label={`${row.username} 선택`}
                    />
                  </td>
                  <td>{row.ga_name ?? '—'}</td>
                  <td>{row.display_name ?? '—'}</td>
                  <td>{row.username}</td>
                  <td>{row.role}</td>
                  <td>
                    <strong>{row.plan}</strong>
                    <span style={{ marginLeft: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                      {PLAN_LABEL[row.plan]}
                    </span>
                  </td>
                  <td>
                    <span
                      style={{
                        padding: '2px 8px',
                        borderRadius: 999,
                        fontSize: 12,
                        fontWeight: 600,
                        color:
                          row.effective_status === 'EXPIRED' ? 'var(--danger)' : 'var(--success)',
                        background:
                          row.effective_status === 'EXPIRED'
                            ? 'color-mix(in srgb, var(--danger) 18%, transparent)'
                            : 'color-mix(in srgb, var(--success) 18%, transparent)',
                      }}
                    >
                      {STATUS_LABEL[row.effective_status]}
                    </span>
                  </td>
                  <td>{formatDate(row.started_at)}</td>
                  <td>{formatDate(row.expires_at)}</td>
                  <td>{remainingLabel(row)}</td>
                  <td>
                    <FormButton htmlType="button" variant="secondary" onClick={() => setEditTarget(row)}>
                      편집
                    </FormButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 12,
        }}
      >
        <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
          총 {total}명 · {page} / {totalPages}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <FormButton
            htmlType="button"
            variant="secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || isLoading}
          >
            이전
          </FormButton>
          <FormButton
            htmlType="button"
            variant="secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || isLoading}
          >
            다음
          </FormButton>
        </div>
      </div>

      <SubscriptionEditDialog
        open={editTarget !== null}
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSubmit={handleSingleUpdate}
      />
    </main>
  )
}
