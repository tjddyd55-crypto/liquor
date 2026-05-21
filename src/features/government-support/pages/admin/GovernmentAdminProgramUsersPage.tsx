import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, LoadingState } from '../../../../components/feedback'
import { FieldWrapper, FormInput, FormSelect } from '../../../../components/form'
import { useAuth } from '../../../auth/AuthProvider'
import GovernmentAdminPageShell from '../../components/GovernmentAdminPageShell'
import { fetchGovernmentAdminUsers } from '../../api/governmentAdminUsersApi'
import { fetchGovAgencies } from '../../api/governmentProfilesApi'
import type { GovAgencyRow } from '../../types/governmentProfile.types'
import type { GovernmentAdminUserRow } from '../../types/governmentAdminUser.types'

const STATUS_FILTER_OPTIONS = [
  { value: '', label: '상태 전체' },
  { value: 'active', label: '정상' },
  { value: 'blocked', label: '접근금지' },
  { value: 'inactive', label: '비활성' },
]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('ko-KR')
}

function tenantLabel(row: GovernmentAdminUserRow): string {
  if (row.tenantName) return row.tenantName
  if (row.agencyCode) return row.agencyCode
  return '—'
}

export default function GovernmentAdminProgramUsersPage() {
  const { token } = useAuth()
  const [agencies, setAgencies] = useState<GovAgencyRow[]>([])
  const [rows, setRows] = useState<GovernmentAdminUserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filterTenant, setFilterTenant] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterQ, setFilterQ] = useState('')

  const tenantFilterOptions = useMemo(
    () => [
      { value: '', label: '소속 전체' },
      ...agencies.map((a) => ({ value: a.id, label: `${a.name} (${a.agencyCode})` })),
    ],
    [agencies],
  )

  const loadAgencies = useCallback(async () => {
    if (!token) return
    try {
      const list = await fetchGovAgencies(token)
      setAgencies(list)
    } catch {
      setAgencies([])
    }
  }, [token])

  const loadUsers = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setLoadError(null)
    try {
      const list = await fetchGovernmentAdminUsers(token, {
        role: 'government_user',
        tenantId: filterTenant || undefined,
        status: filterStatus || undefined,
        q: filterQ.trim() || undefined,
      })
      setRows(list)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '이용자 목록을 불러오지 못했습니다.')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, filterTenant, filterStatus, filterQ])

  useEffect(() => {
    void loadAgencies()
  }, [loadAgencies])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  return (
    <GovernmentAdminPageShell
      title="이용자 관리"
      description="기관 코드로 가입한 프로그램 이용자 계정·상태만 확인합니다. 사업장/고객/신청 데이터는 이용자 본인 워크스페이스에서 관리합니다."
      toolbar={
        <>
          <FieldWrapper label="검색">
            <FormInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="아이디·이름" />
          </FieldWrapper>
          <FieldWrapper label="소속 대행사">
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
      {loading ? <LoadingState message="불러오는 중…" /> : null}
      {!loading && rows.length === 0 ? (
        <EmptyState message="등록된 이용자가 없습니다. 대행사 코드로 회원가입하면 목록에 표시됩니다." />
      ) : null}
      {!loading && rows.length > 0 ? (
        <div className="table-container table-container--desktop">
          <table className="admin-data-table">
            <thead>
              <tr>
                <th>아이디</th>
                <th>이름</th>
                <th>소속 대행사</th>
                <th>가입일</th>
                <th>상태</th>
                <th className="admin-table-cell--actions">관리</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.username}</td>
                  <td>{row.displayName || '—'}</td>
                  <td>{tenantLabel(row)}</td>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>
                    {row.status === 'active'
                      ? '정상'
                      : row.status === 'blocked'
                        ? '접근금지'
                        : row.status === 'inactive'
                          ? '비활성'
                          : row.status}
                  </td>
                  <td className="admin-table-cell--actions">
                    <Link
                      to={`/government/admin/program-users/${row.id}`}
                      className="button button--secondary dark-link"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </GovernmentAdminPageShell>
  )
}
