import { useCallback, useEffect, useState } from 'react'
import { EmptyState, LoadingState, StatusMessage } from '../../../components/feedback'
import { FieldWrapper, FormInput, FormSelect } from '../../../components/form'
import { useDocumentTitle } from '../../../hooks/useDocumentTitle'
import { useAuth } from '../../auth/AuthProvider'
import { fetchGovernmentNotices, type GovernmentNoticeRow } from '../api/governmentOperationsApi'
import {
  GOVERNMENT_NOTICE_CATEGORIES,
  formatOpsDate,
  labelForNoticeCategory,
} from '../constants/governmentOperations'
import '../government-support.css'

export default function GovernmentUserNoticesPage() {
  useDocumentTitle('정부지원 CRM · 공지사항')
  const { token } = useAuth()
  const [rows, setRows] = useState<GovernmentNoticeRow[]>([])
  const [selected, setSelected] = useState<GovernmentNoticeRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filterCategory, setFilterCategory] = useState('')
  const [filterQ, setFilterQ] = useState('')

  const load = useCallback(async () => {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const list = await fetchGovernmentNotices(token, {
        category: filterCategory || undefined,
        q: filterQ.trim() || undefined,
      })
      setRows(list)
      setSelected((prev) => (prev ? list.find((r) => r.id === prev.id) ?? list[0] ?? null : list[0] ?? null))
    } catch (e) {
      setError(e instanceof Error ? e.message : '공지를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, filterCategory, filterQ])

  useEffect(() => {
    void load()
  }, [load])

  const pinned = rows.filter((r) => r.isPinned)
  const normal = rows.filter((r) => !r.isPinned)

  return (
    <section className="government-user-section government-user-notices-page">
      <h1 className="government-page__title">공지사항</h1>
      <p className="government-page__muted">소속 대행사 및 전체 공지를 확인할 수 있습니다.</p>

      <section className="government-admin-users-page__filters">
        <FieldWrapper label="검색">
          <FormInput value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="제목·내용" />
        </FieldWrapper>
        <FieldWrapper label="구분">
          <FormSelect
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            options={[{ value: '', label: '전체' }, ...GOVERNMENT_NOTICE_CATEGORIES]}
          />
        </FieldWrapper>
      </section>

      {error ? <StatusMessage message={error} tone="error" className="m-3" /> : null}
      {loading ? <LoadingState message="불러오는 중…" /> : null}
      {!loading && rows.length === 0 ? <EmptyState message="표시할 공지가 없습니다." /> : null}

      {!loading && rows.length > 0 ? (
        <div className="government-user-ops-layout">
          <aside className="government-user-ops-list">
            {[...pinned, ...normal].map((row) => (
              <button
                key={row.id}
                type="button"
                className={`government-list-item ${selected?.id === row.id ? 'government-list-item--active' : ''}`}
                onClick={() => setSelected(row)}
              >
                <div className="government-list-item__title">
                  {row.isPinned ? <span className="government-ops-badge">중요</span> : null} {row.title}
                </div>
                <div className="government-list-item__meta">
                  {labelForNoticeCategory(row.category)} · {formatOpsDate(row.publishedAt ?? row.createdAt)}
                </div>
              </button>
            ))}
          </aside>
          {selected ? (
            <article className="government-user-ops-detail">
              <h2 className="government-page__title">{selected.title}</h2>
              <p className="government-page__muted">
                {labelForNoticeCategory(selected.category)} · {formatOpsDate(selected.publishedAt ?? selected.createdAt)}
              </p>
              <div className="government-user-ops-detail__body">{selected.content}</div>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
