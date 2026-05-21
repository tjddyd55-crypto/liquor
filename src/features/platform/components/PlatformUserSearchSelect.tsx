import { useEffect, useState } from 'react'
import FormInput from '../../../components/form/FormInput'
import { ApiError } from '../../../lib/apiClient'
import { searchPlatformUsers } from '../api/platformAdminApi'
import type { PlatformUserSearchItem } from '../platformAdmin.types'

const SEARCH_DEBOUNCE_MS = 400

function mapSearchError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      return '로그인이 필요하거나 세션이 만료되었습니다.'
    }
    if (err.status === 403) {
      return '플랫폼 사용자 검색을 수행할 권한이 없습니다.'
    }
    const msg = err.message.trim()
    return msg !== '' ? msg : '검색 요청에 실패했습니다.'
  }
  return '검색 요청에 실패했습니다.'
}

export type PlatformUserSearchSelectProps = {
  token: string | null
  userIdValue: string
  setUserId: (v: string) => void
  variant: 'pc' | 'mobile'
  disabled?: boolean
  searchInputId: string
  onInteract?: () => void
}

export function PlatformUserSearchSelect({
  token,
  userIdValue,
  setUserId,
  variant,
  disabled,
  searchInputId,
  onInteract,
}: PlatformUserSearchSelectProps) {
  const [searchQ, setSearchQ] = useState('')
  const [results, setResults] = useState<PlatformUserSearchItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selectedSummary, setSelectedSummary] = useState<PlatformUserSearchItem | null>(null)

  useEffect(() => {
    const uid = userIdValue.trim()
    if (uid === '') {
      setSelectedSummary(null)
      return
    }
    setSelectedSummary((prev) => (prev != null && prev.id === uid ? prev : null))
  }, [userIdValue])

  useEffect(() => {
    const q = searchQ.trim()
    if (q.length < 2) {
      setResults([])
      setSearchError(null)
      setLoading(false)
      return undefined
    }
    if (!token) {
      setResults([])
      setSearchError('로그인이 필요합니다.')
      setLoading(false)
      return undefined
    }

    let cancelled = false
    setLoading(true)
    setSearchError(null)

    const tm = window.setTimeout(() => {
      void (async () => {
        try {
          const res = await searchPlatformUsers(token, { q })
          if (cancelled) return
          setResults(res.items)
          setLoading(false)
        } catch (e) {
          if (cancelled) return
          setResults([])
          setSearchError(mapSearchError(e))
          setLoading(false)
        }
      })()
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      window.clearTimeout(tm)
      setLoading(false)
    }
  }, [searchQ, token])

  const qOk = searchQ.trim().length >= 2
  const showEmpty = qOk && !loading && searchError === null && results.length === 0

  const choose = (row: PlatformUserSearchItem) => {
    onInteract?.()
    setSelectedSummary(row)
    setUserId(row.id)
  }

  return (
    <div className="platform-admin-page__user-search platform-admin-page__form-field">
      <label className="dark-label" htmlFor={searchInputId}>
        사용자 검색
      </label>
      <p className="platform-admin-page__field-hint">
        username으로 검색해서 선택하거나 users.id UUID를 직접 입력할 수 있습니다. 로그인 아이디(username)가 아니라{' '}
        <strong>실제 전송 값은 users.id UUID</strong>입니다.
      </p>
      <p className="platform-admin-page__field-hint">
        검색어가 <strong>2자 이상</strong>이면 자동으로 검색됩니다.
      </p>
      <FormInput
        id={searchInputId}
        name="platformUserSearch"
        autoComplete="off"
        value={searchQ}
        onChange={(e) => {
          setSearchQ(e.target.value)
        }}
        disabled={disabled}
        placeholder="username 또는 표시 이름 일부 입력"
      />
      {searchQ.trim().length === 1 ? (
        <p className="platform-admin-page__field-error" role="status">
          검색어를 2자 이상 입력해 주세요.
        </p>
      ) : null}
      {loading ? <p className="platform-admin-page__muted">검색 중…</p> : null}
      {searchError ? (
        <div className="platform-admin-page__panel platform-admin-page__panel--error" role="alert">
          <p>{searchError}</p>
        </div>
      ) : null}
      {showEmpty ? <p className="platform-admin-page__muted">검색 결과가 없습니다.</p> : null}
      {!loading && results.length > 0 ? (
        <ul className={`platform-admin-page__user-search-results platform-admin-page__card-list ${variant === 'pc' ? 'platform-admin-page__user-search-results--pc' : ''}`}>
          {results.map((row) => (
            <li key={row.id} className="platform-admin-page__stack-card platform-admin-page__user-search-hit">
              <button
                type="button"
                className="platform-admin-page__user-search-pick"
                disabled={disabled}
                onClick={() => choose(row)}
              >
                <span className="platform-admin-page__user-search-pick-title">{row.username}</span>
                <span className="platform-admin-page__muted">
                  {row.displayName.trim() !== '' ? row.displayName : '—'}{' '}
                  <span className="platform-admin-page__mono">· {row.role}</span>
                </span>
                <span className="platform-admin-page__muted">{row.gaCompanyName ?? 'GA 없음'}</span>
                <span className="platform-admin-page__mono">id {row.id}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {selectedSummary != null ? (
        <div className="platform-admin-page__panel platform-admin-page__user-search-selected" aria-live="polite">
          <h4 className="platform-admin-page__panel-title">선택한 사용자</h4>
          <dl className="platform-admin-page__dl">
            <dt>username</dt>
            <dd>{selectedSummary.username}</dd>
            <dt>displayName</dt>
            <dd>{selectedSummary.displayName.trim() !== '' ? selectedSummary.displayName : '—'}</dd>
            <dt>role</dt>
            <dd>{selectedSummary.role}</dd>
            <dt>status</dt>
            <dd>{selectedSummary.status}</dd>
            <dt>gaCompanyName</dt>
            <dd>{selectedSummary.gaCompanyName ?? '—'}</dd>
            <dt>users.id</dt>
            <dd className="platform-admin-page__mono">{selectedSummary.id}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  )
}
