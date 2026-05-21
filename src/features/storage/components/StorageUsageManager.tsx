import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FormButton } from '../../../components/form'
import { createStorageFileDownloadUrl, deleteStorageFile, openStorageFile } from '../api/storageApi'
import {
  getStorageUsageBreakdown,
  type StorageUsageBreakdown,
  type StorageUsageItem,
  type StorageUsageSource,
} from '../api/storageUsageApi'

type StorageUsageManagerProps = {
  token: string
  onStorageChanged?: () => void
}

type StorageUsageSortMode = 'size-desc' | 'latest' | 'name'

function emptyBreakdown(): StorageUsageBreakdown {
  return {
    items: [],
    summary: [
      { source: 'personal-storage', label: '내 파일', count: 0, size: 0 },
      { source: 'customer-storage', label: '고객 파일', count: 0, size: 0 },
      { source: 'claim-file', label: '청구 첨부', count: 0, size: 0 },
      { source: 'customer-news', label: '소식지 첨부', count: 0, size: 0 },
    ],
    totalCount: 0,
    totalSize: 0,
  }
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB'
  }
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }
  return `${Math.ceil(bytes / 1024)} KB`
}

function formatDate(iso: string | null): string {
  if (!iso) {
    return '—'
  }
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return String(iso).slice(0, 10) || '—'
  }
  return date.toLocaleDateString('ko-KR')
}

function scrollToStorageWorkspace() {
  window.setTimeout(() => {
    const target = document.querySelector('.storage-workspace')
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, 80)
}

function compareUsageItems(a: StorageUsageItem, b: StorageUsageItem, sortMode: StorageUsageSortMode): number {
  if (sortMode === 'latest') {
    return String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))
  }
  if (sortMode === 'name') {
    return String(a.fileName ?? '').localeCompare(String(b.fileName ?? ''), 'ko')
  }
  return (Number(b.size) || 0) - (Number(a.size) || 0)
}

export default function StorageUsageManager({ token, onStorageChanged }: StorageUsageManagerProps) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [breakdown, setBreakdown] = useState<StorageUsageBreakdown>(() => emptyBreakdown())
  const [sourceFilter, setSourceFilter] = useState<StorageUsageSource | 'all'>('all')
  const [searchText, setSearchText] = useState('')
  const [sortMode, setSortMode] = useState<StorageUsageSortMode>('size-desc')

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return breakdown.items
      .filter((item) => {
        if (sourceFilter !== 'all' && item.source !== sourceFilter) {
          return false
        }
        if (!query) {
          return true
        }
        const haystack = [item.fileName, item.locationLabel, item.customerName, item.sourceLabel]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(query)
      })
      .sort((a, b) => compareUsageItems(a, b, sortMode))
  }, [breakdown.items, searchText, sortMode, sourceFilter])

  const hasActiveFilter = sourceFilter !== 'all' || searchText.trim().length > 0 || sortMode !== 'size-desc'

  const usageDownloadRef = useRef<Record<number, string>>({})
  const [usageDownloadHrefByFileId, setUsageDownloadHrefByFileId] = useState<Record<number, string>>({})
  const [usageDownloadFailedIds, setUsageDownloadFailedIds] = useState<ReadonlySet<number>>(() => new Set())

  const filteredUsageDownloadKey = useMemo(() => {
    return filteredItems
      .map((item) => item.storageFileId)
      .filter((id): id is number => typeof id === 'number' && id > 0)
      .sort((a, b) => a - b)
      .join(',')
  }, [filteredItems])

  useEffect(() => {
    if (!open || !token.trim()) {
      usageDownloadRef.current = {}
      setUsageDownloadHrefByFileId({})
      setUsageDownloadFailedIds(new Set())
      return
    }
    let cancelled = false
    const run = async () => {
      const next: Record<number, string> = {}
      const failed = new Set<number>()
      for (const item of filteredItems) {
        const fid = item.storageFileId
        if (!fid) {
          continue
        }
        try {
          const href = await createStorageFileDownloadUrl(token, fid)
          if (cancelled) {
            return
          }
          next[fid] = href
        } catch {
          failed.add(fid)
        }
      }
      usageDownloadRef.current = next
      if (!cancelled) {
        setUsageDownloadHrefByFileId({ ...next })
        setUsageDownloadFailedIds(failed)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, token, filteredItems, filteredUsageDownloadKey])

  const resetFilters = useCallback(() => {
    setSourceFilter('all')
    setSearchText('')
    setSortMode('size-desc')
  }, [])

  const loadUsage = useCallback(async () => {
    if (!token?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const nextBreakdown = await getStorageUsageBreakdown(token)
      setBreakdown(nextBreakdown)
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '용량 사용처를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token])

  const handleDelete = useCallback(async (item: StorageUsageItem) => {
    if (!token?.trim() || !item.storageFileId || !item.canDeleteDirectly) {
      return
    }
    const ok = window.confirm(`"${item.fileName}" 파일을 삭제할까요?`)
    if (!ok) {
      return
    }
    setDeletingId(item.id)
    setError('')
    try {
      await deleteStorageFile(token, item.storageFileId)
      setBreakdown((prev) => {
        const items = prev.items.filter((row) => row.id !== item.id)
        const totalSize = items.reduce((sum, row) => sum + (Number(row.size) || 0), 0)
        const summary = prev.summary.map((group) => {
          const groupItems = items.filter((row) => row.source === group.source)
          return {
            ...group,
            count: groupItems.length,
            size: groupItems.reduce((sum, row) => sum + (Number(row.size) || 0), 0),
          }
        })
        return { items, summary, totalCount: items.length, totalSize }
      })
      onStorageChanged?.()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '파일 삭제에 실패했습니다.')
    } finally {
      setDeletingId(null)
    }
  }, [onStorageChanged, token])

  const handleOpenStorageFile = useCallback(async (item: StorageUsageItem) => {
    if (!token?.trim() || !item.storageFileId) {
      return
    }
    try {
      await openStorageFile(token, item.storageFileId)
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : '파일 열기에 실패했습니다.')
    }
  }, [token])

  const handleGoSource = useCallback((item: StorageUsageItem) => {
    if (item.source === 'personal-storage') {
      setOpen(false)
      navigate('/storage', { replace: true })
      scrollToStorageWorkspace()
      return
    }
    if (item.source === 'customer-storage' && item.customerId) {
      navigate(`/customers/${item.customerId}/files`)
      return
    }
    if (item.source === 'claim-file' && item.customerId && item.claimRequestId) {
      navigate(`/customers/${item.customerId}/claim-requests?claimId=${item.claimRequestId}`)
      return
    }
    if (item.source === 'customer-news') {
      navigate(`/claim-requests?claimTab=${item.newsScope === 'personal' ? 'news-personal' : 'news-all'}`)
      return
    }
    navigate('/storage')
  }, [navigate])

  return (
    <section className="storage-usage-manager">
      <div className="storage-usage-manager__header">
        <div>
          <h2>전체 용량 사용처</h2>
          <p>내 파일, 고객 파일, 청구 첨부, 고객 소식지 첨부가 어디에 얼마나 쓰이는지 확인합니다.</p>
        </div>
        <div className="storage-usage-manager__actions">
          <FormButton
            htmlType="button"
            variant="secondary"
            onClick={() => {
              setOpen((value) => !value)
              if (!open && breakdown.items.length === 0) {
                void loadUsage()
              }
            }}
          >
            {open ? '접기' : '사용처 보기'}
          </FormButton>
          {open ? (
            <FormButton htmlType="button" variant="secondary" onClick={() => void loadUsage()} loading={loading}>
              새로고침
            </FormButton>
          ) : null}
        </div>
      </div>

      {open ? (
        <>
          {error ? <p className="storage-usage-manager__error">{error}</p> : null}
          <div className="storage-usage-manager__summary">
            <div className="storage-usage-manager__summary-card storage-usage-manager__summary-card--total">
              <span>분석된 파일</span>
              <strong>{breakdown.totalCount}개</strong>
              <small>{formatBytes(breakdown.totalSize)}</small>
            </div>
            {breakdown.summary.map((group) => (
              <div key={group.source} className="storage-usage-manager__summary-card">
                <span>{group.label}</span>
                <strong>{group.count}개</strong>
                <small>{formatBytes(group.size)}</small>
              </div>
            ))}
          </div>

          <div className="storage-usage-manager__filters" role="search">
            <input
              type="search"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="파일명, 고객명, 위치 검색"
              aria-label="용량 사용처 검색"
            />
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as StorageUsageSource | 'all')}
              aria-label="사용처 필터"
            >
              <option value="all">전체 사용처</option>
              <option value="personal-storage">내 파일</option>
              <option value="customer-storage">고객 파일</option>
              <option value="claim-file">청구 첨부</option>
              <option value="customer-news">소식지 첨부</option>
            </select>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as StorageUsageSortMode)}
              aria-label="정렬"
            >
              <option value="size-desc">용량 큰 순</option>
              <option value="latest">최신순</option>
              <option value="name">이름순</option>
            </select>
            {hasActiveFilter ? (
              <button type="button" className="storage-usage-manager__filter-reset" onClick={resetFilters}>
                필터 초기화
              </button>
            ) : null}
          </div>

          <p className="storage-usage-manager__count">
            표시 {filteredItems.length}개 / 전체 {breakdown.totalCount}개
          </p>

          {loading ? <div className="storage-usage-manager__empty">용량 사용처를 불러오는 중…</div> : null}
          {!loading && breakdown.items.length === 0 ? <div className="storage-usage-manager__empty">표시할 파일이 없습니다.</div> : null}
          {!loading && breakdown.items.length > 0 && filteredItems.length === 0 ? (
            <div className="storage-usage-manager__empty">조건에 맞는 파일이 없습니다.</div>
          ) : null}
          {!loading && filteredItems.length > 0 ? (
            <div className="storage-usage-manager__list">
              {filteredItems.map((item) => (
                <article key={item.id} className="storage-usage-manager__item">
                  <div className="storage-usage-manager__item-main">
                    <span className={`storage-usage-manager__badge storage-usage-manager__badge--${item.source}`}>{item.sourceLabel}</span>
                    <strong>{item.fileName}</strong>
                    <p>{item.locationLabel}</p>
                    <small>{formatBytes(item.size)} · {formatDate(item.createdAt)}</small>
                  </div>
                  <div className="storage-usage-manager__item-actions">
                    {item.storageFileId ? (
                      <>
                        <button type="button" onClick={() => void handleOpenStorageFile(item)}>열기</button>
                        {usageDownloadHrefByFileId[item.storageFileId] ? (
                          <a
                            href={usageDownloadHrefByFileId[item.storageFileId]}
                            download
                            className="button button--small"
                          >
                            다운
                          </a>
                        ) : (
                          <button type="button" disabled>
                            {usageDownloadFailedIds.has(item.storageFileId) ? '준비 실패' : '준비 중'}
                          </button>
                        )}
                      </>
                    ) : null}
                    <button type="button" onClick={() => handleGoSource(item)}>원본관리</button>
                    {item.canDeleteDirectly ? (
                      <button
                        type="button"
                        className="storage-usage-manager__danger"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item)}
                      >
                        삭제
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  )
}
