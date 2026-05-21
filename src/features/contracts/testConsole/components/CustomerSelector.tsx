import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../../../../lib/apiClient'
import { FormButton, FormInput } from '../../../../components/form'
import type { CustomerRecord } from '../../../customers/domain/types'
import { maskCustomerNameForTestConsole, maskPhoneForTestConsole } from '../contractSignatureTestDisplay'

const MIN_QUERY_LEN = 2

type Props = {
  token: string
  disabled: boolean
  /** SUPER_ADMIN 등에서 GA 스코프가 없으면 검색 불가 사유 */
  searchBlockedMessage?: string | null
  onSearch: (q: string) => Promise<CustomerRecord[]>
  selected: CustomerRecord | null
  onSelect: (c: CustomerRecord | null) => void
}

function isQueryAllowed(raw: string): boolean {
  const t = raw.trim()
  if (t.length === 0) {
    return false
  }
  if (t.length >= MIN_QUERY_LEN) {
    return true
  }
  return /^\d+$/.test(t)
}

export function CustomerSelector({
  token,
  disabled,
  searchBlockedMessage,
  onSearch,
  selected,
  onSelect,
}: Props) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CustomerRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const runSearch = useCallback(async () => {
    if (!token.trim() || disabled) {
      return
    }
    if (searchBlockedMessage) {
      setSearchError(searchBlockedMessage)
      return
    }
    const trimmed = q.trim()
    if (!trimmed) {
      setSearchError('검색어를 입력해 주세요.')
      setResults([])
      setSearched(false)
      return
    }
    if (!isQueryAllowed(trimmed)) {
      setSearchError(`검색어는 ${MIN_QUERY_LEN}글자 이상 입력해 주세요. (고객 ID만 숫자로 검색할 수 있습니다.)`)
      return
    }
    setSearchError(null)
    setLoading(true)
    setSearched(true)
    try {
      const rows = await onSearch(trimmed)
      setResults(rows)
    } catch (e) {
      setResults([])
      const msg = e instanceof ApiError ? e.message : '고객 검색에 실패했습니다.'
      setSearchError(msg)
    } finally {
      setLoading(false)
    }
  }, [token, disabled, searchBlockedMessage, onSearch, q])

  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      setSearched(false)
      setSearchError(null)
    }
  }, [q])

  const phoneOk = (c: CustomerRecord) => {
    const p = String(c.phone ?? c.phoneNumber ?? '').replace(/\D/g, '')
    return p.length >= 10
  }

  const blockActive = Boolean(disabled || searchBlockedMessage)

  return (
    <div>
      <p className="contract-signature-console__hint" style={{ margin: '0 0 8px', fontSize: 13 }}>
        기존 고객관리 메뉴에 등록된 고객을 검색해 선택하세요.
      </p>
      {searchBlockedMessage ? (
        <div className="contract-signature-console__inline-warning" role="status" style={{ marginBottom: 8 }}>
          {searchBlockedMessage}
        </div>
      ) : null}
      <div className="contract-signature-console__search-row">
        <FormInput
          className="form-control form-control-sm"
          style={{ maxWidth: 280 }}
          placeholder="등록 고객 이름·전화번호 일부·고객번호 검색"
          value={q}
          disabled={blockActive}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void runSearch()
            }
          }}
        />
        <FormButton htmlType="button" variant="primary" size="sm" disabled={blockActive || loading} onClick={() => void runSearch()}>
          {loading ? '검색 중…' : '검색'}
        </FormButton>
      </div>
      {searchError ? (
        <p className="contract-signature-console__inline-warning" role="alert" style={{ margin: '8px 0 0' }}>
          {searchError}
        </p>
      ) : null}
      {selected ? (
        <div className="contract-signature-console__selected-card">
          <div className="contract-signature-console__muted" style={{ fontWeight: 600, marginBottom: 6 }}>
            선택 고객
          </div>
          <div>이름: {selected.name.trim() || '—'}</div>
          <div>
            고객번호: <strong>{selected.customerCode?.trim() || `ID ${selected.id}`}</strong>
          </div>
          <div>휴대폰: {maskPhoneForTestConsole(selected.phone ?? selected.phoneNumber ?? '')}</div>
          {!phoneOk(selected) ? (
            <div className="contract-signature-console__inline-warning">
              선택한 고객에게 등록된 휴대폰번호가 없어 전자서명 링크를 발송할 수 없습니다.
            </div>
          ) : null}
          <FormButton htmlType="button" variant="action" size="sm" className="p-0 mt-1" onClick={() => onSelect(null)}>
            선택 해제
          </FormButton>
        </div>
      ) : null}
      {searched && !loading && !searchError && results.length === 0 ? (
        <p className="contract-signature-console__muted" style={{ margin: '8px 0 0' }}>
          등록된 고객을 찾을 수 없습니다.
        </p>
      ) : null}
      {results.length > 0 ? (
        <ul className="contract-signature-console__hit-list">
          {results.map((c) => (
            <li key={c.id} className="contract-signature-console__hit-item">
              <div style={{ fontSize: 13 }}>
                <div>
                  {c.customerCode?.trim() ? `${c.customerCode.trim()} · ` : ''}#{c.id} · {maskCustomerNameForTestConsole(c.name)}
                </div>
                <div className="contract-signature-console__muted">{maskPhoneForTestConsole(c.phone ?? c.phoneNumber ?? '')}</div>
              </div>
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                disabled={blockActive}
                onClick={() => onSelect(c)}
              >
                선택
              </FormButton>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
