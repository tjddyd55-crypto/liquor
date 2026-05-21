import { type CSSProperties, type FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput } from '../../../components/form'
import { listCustomers } from '../api/customersApi'
import {
  createCustomerRelation,
  deleteCustomerRelation,
  listCustomerRelations,
  type CustomerRelationRow,
} from '../api/customerExtraApi'
import type { CustomerRecord } from '../domain/types'
import { formatCustomerPhoneUi } from '../utils/customerDisplayFormat'
import { parseBirthDateFromRrn } from '../utils/insuranceAge'



type Props = {
  customerId: number
  customerName: string
  token: string
  onOpenCustomer: (id: number, name?: string) => void
  /** 펼쳐져 보고 있는 고객 ID — 연계 칩과 같으면 강조 */
  focusedCustomerId: number | null
}

const chipWrap: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'stretch',
  borderRadius: 8,
  overflow: 'hidden',
  flexShrink: 0,
}

function formatBirthYmdDotFromSsn(ssn: string | null | undefined): string {
  const birthDate = parseBirthDateFromRrn(String(ssn ?? ''))
  if (!birthDate) {
    return '-'
  }
  const y = String(birthDate.getFullYear())
  const m = String(birthDate.getMonth() + 1).padStart(2, '0')
  const d = String(birthDate.getDate()).padStart(2, '0')
  return `${y}.${m}.${d}`
}

export function CustomerRelationsStrip({
  customerId,
  customerName,
  token,
  onOpenCustomer,
  focusedCustomerId,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [relations, setRelations] = useState<CustomerRelationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [searchQ, setSearchQ] = useState('')
  const [searchBusy, setSearchBusy] = useState(false)
  const [searchPool, setSearchPool] = useState<CustomerRecord[]>([])
  const [linking, setLinking] = useState(false)
  const relatedIdSet = useMemo(() => new Set(relations.map((r) => r.relatedCustomerId)), [relations])

  const loadRelations = useCallback(async () => {
    if (!token?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    setNotice('')
    try {
      const r = await listCustomerRelations(token, customerId)
      setRelations(r)
    } catch (e) {
      setError(e instanceof Error ? e.message : '연계 고객을 불러오지 못했습니다.')
      setRelations([])
    } finally {
      setLoading(false)
    }
  }, [token, customerId])

  useEffect(() => {
    void loadRelations()
  }, [loadRelations])

  useEffect(() => {
    if (!modalOpen || !token?.trim()) {
      return
    }
    let cancelled = false
    void (async () => {
      setSearchBusy(true)
      try {
        const { customers } = await listCustomers(token, 500)
        if (cancelled) {
          return
        }
        setSearchPool(customers)
      } catch (e) {
        if (!cancelled) {
          setSearchPool([])
          setError(e instanceof Error ? e.message : '검색에 실패했습니다.')
        }
      } finally {
        if (!cancelled) {
          setSearchBusy(false)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [modalOpen, token])

  const hits = useMemo(() => {
    const q = searchQ.trim()
    const rows = q
      ? searchPool.filter((c) => c.name.includes(q) || (c.phone ?? '').includes(q))
      : searchPool
    const out: CustomerRecord[] = []
    const seen = new Set<number>()
    for (const row of rows) {
      if (row.id === customerId) {
        continue
      }
      if (seen.has(row.id)) {
        continue
      }
      seen.add(row.id)
      out.push(row)
    }
    return out
  }, [customerId, searchPool, searchQ])

  const linkTo = async (target: CustomerRecord) => {
    if (!token?.trim()) {
      return
    }
    if (relatedIdSet.has(target.id)) {
      setNotice('이미 연결된 고객입니다.')
      return
    }
    setLinking(true)
    setError('')
    setNotice('')
    try {
      await createCustomerRelation(token, customerId, target.id)
      setNotice(`${target.name} 고객과 연결했습니다.`)
      setModalOpen(false)
      setSearchQ('')
      await loadRelations()
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결에 실패했습니다.')
    } finally {
      setLinking(false)
    }
  }

  const unlink = async (relatedCustomerId: number) => {
    if (!token?.trim()) {
      return
    }
    const confirmed = await confirm({
      title: '연결 해제',
      message: '이 고객과의 연결을 해제할까요?',
      tone: 'danger',
    })
    if (!confirmed) {
      return
    }
    setError('')
    setNotice('')
    try {
      await deleteCustomerRelation(token, customerId, relatedCustomerId)
      await loadRelations()
    } catch (e) {
      setError(e instanceof Error ? e.message : '연결 해제에 실패했습니다.')
    }
  }

  const requestCloseRelationsModal = useCallback(async () => {
    if (linking) {
      return
    }
    if (!searchQ.trim()) {
      setModalOpen(false)
      return
    }
    const ok = await confirm({
      title: '연계 고객 검색',
      message: '검색어가 입력되어 있습니다. 닫을까요?',
      confirmLabel: '닫기',
      cancelLabel: '계속',
      tone: 'warning',
    })
    if (ok) {
      setModalOpen(false)
    }
  }, [confirm, linking, searchQ])

  return (
    <section className="customer-relations-strip customer-detail-read__section customer-relations-strip--in-detail mt-5">
      <div className="customer-detail-read__section-header customer-relations-strip__title-row">
        <h4 className="customer-detail-read__section-title">연계 고객</h4>
        <FormButton
          htmlType="button"
          variant="action"
          className="filter-button customer-relations-strip__inline-add"
          onClick={() => {
            setError('')
            setNotice('')
            setModalOpen(true)
            setSearchPool([])
          }}
        >
          + 추가
        </FormButton>
      </div>
      <div className="customer-detail-read__section-body">
        {loading ? (
          <p style={{ fontSize: '0.9rem', color: '#666' }}>불러오는 중…</p>
        ) : error ? (
          <p style={{ color: '#b00020', fontSize: '0.9rem' }} role="alert">
            {error}
          </p>
        ) : notice ? (
          <p style={{ color: '#1f9d55', fontSize: '0.9rem' }} role="status">
            {notice}
          </p>
        ) : null}
        <div className="customer-relations-strip__chip-grid">
          {relations.map((r) => {
            const displayName = r.relatedName?.trim() ? r.relatedName.trim() : '이름 미등록'
            const phoneTip = r.relatedPhone?.trim() ? `전화: ${r.relatedPhone.trim()}` : `${displayName} (연결됨)`
            const isFocused = focusedCustomerId != null && focusedCustomerId === r.relatedCustomerId
            return (
              <div
                key={r.relatedCustomerId}
                className="related-customer-tag customer-relations-strip__chip-cell"
                style={{
                  ...chipWrap,
                  border: isFocused ? '2px solid #2563eb' : '1px solid rgba(0,0,0,0.18)',
                  boxShadow: isFocused ? '0 0 0 1px rgba(37,99,235,0.2)' : undefined,
                  justifySelf: 'start',
                }}
              >
                <FormButton
                  htmlType="button"
                  variant="action"
                  className="filter-button related-customer-tag__name"
                  style={{
                    border: 'none',
                    borderRadius: 0,
                    minHeight: 0,
                    padding: '6px 10px',
                    fontSize: '0.875rem',
                  }}
                  title={phoneTip}
                  onClick={() => onOpenCustomer(r.relatedCustomerId, r.relatedName)}
                >
                  {displayName}
                </FormButton>
                <FormButton
                  htmlType="button"
                  variant="action"
                  className="delete-btn related-customer-tag__remove"
                  aria-label={`${displayName} 연결 해제`}
                  title="연결 해제"
                  style={{
                    border: 'none',
                    borderRadius: 0,
                    minWidth: 0,
                    minHeight: 0,
                    padding: '4px 8px',
                    fontSize: '1rem',
                    lineHeight: 1,
                  }}
                  onClick={(e) => {
                    e.stopPropagation()
                    void unlink(r.relatedCustomerId)
                  }}
                >
                  ×
                </FormButton>
              </div>
            )
          })}
        </div>
        <p style={{ fontSize: '0.8rem', color: '#777', margin: '8px 0 0' }}>
          {customerName}님과 연결된 다른 고객입니다. 이름을 누르면 해당 고객 상세로 이동합니다. 칩에 마우스를 올리면 전화번호
          힌트가 표시됩니다.
        </p>
      </div>

      {modalOpen ? (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={(e) => {
            /* 연계 고객 검색: 입력 유실 방지 — backdrop 클릭으로 닫지 않음(명시적 닫기만). */
            e.stopPropagation()
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape' || linking) {
              return
            }
            e.preventDefault()
            void requestCloseRelationsModal()
          }}
        >
          <div
            className="modal customer-relations-modal"
            role="dialog"
            aria-modal="true"
            aria-label="연계 고객 검색"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%' }}
          >
            <h3 style={{ marginTop: 0 }}>고객 검색 후 연결</h3>
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
              }}
            >
              <FormInput
                type="search"
                className="search-input customer-relations-modal__search"
                placeholder="이름 또는 전화번호 검색"
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                autoFocus
                autoComplete="off"
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </form>
            {searchBusy ? <p style={{ fontSize: '0.9rem' }}>검색 중…</p> : null}
            {/* 모바일 리스트: '이름 / 생년월일 / 연락처' 3필드 고정.
                한 행 안에서 정보 위계를 둘 레이아웃(이름=주요, 생년/연락처=보조)으로 두어
                좁은 화면에서도 식별이 쉽도록 했다. 연결됨 상태는 상단 우측 배지. */}
            <ul className="related-list-mobile">
              {hits.map((h) => {
                const alreadyLinked = relatedIdSet.has(h.id)
                const disabled = linking || alreadyLinked
                const birth = formatBirthYmdDotFromSsn(h.ssn)
                const phone = formatCustomerPhoneUi(h.phone) || '-'
                return (
                  <li key={h.id} className="related-list-mobile__item">
                    <FormButton
                      htmlType="button"
                      variant="action"
                      className={`related-list-mobile__row${alreadyLinked ? ' related-list-mobile__row--linked' : ''}`}
                      disabled={disabled}
                      onClick={() => void linkTo(h)}
                      aria-label={`${h.name} 연결`}
                    >
                      <span className="related-list-mobile__main">
                        <span className="related-list-mobile__name">{h.name}</span>
                        {alreadyLinked ? (
                          <span className="related-list-mobile__badge">연결됨</span>
                        ) : null}
                      </span>
                      <span className="related-list-mobile__sub">
                        <span className="related-list-mobile__birth">{birth}</span>
                        <span className="related-list-mobile__dot" aria-hidden>·</span>
                        <span className="related-list-mobile__phone">{phone}</span>
                      </span>
                    </FormButton>
                  </li>
                )
              })}
              {hits.length === 0 && !searchBusy ? (
                <li className="related-list-mobile__empty">검색 결과가 없습니다.</li>
              ) : null}
            </ul>
            {/* PC 테이블 뷰: 별도 '연결' 버튼을 두는 대신 **행 자체가 버튼**이 된다.
                이유:
                - 좁은 모달 폭에서 별도 액션 컬럼이 가로 스크롤 원인이었다.
                - 연결은 결국 한 가지 동작이어서, 액션 컬럼을 분리할 이유가 약하다.
                - 키보드 접근성은 role="button" + Enter/Space 핸들러로 보존한다. */}
            <div className="related-list related-list--pc">
              <div className="related-list__header row" role="presentation">
                <div className="name">이름</div>
                <div className="birth">생년월일</div>
                <div className="phone">연락처</div>
              </div>
              <ul className="related-list__body" role="list">
                {hits.map((h) => {
                  const alreadyLinked = relatedIdSet.has(h.id)
                  const disabled = linking || alreadyLinked
                  const birth = formatBirthYmdDotFromSsn(h.ssn)
                  const phone = formatCustomerPhoneUi(h.phone) || '-'
                  const triggerLink = () => {
                    if (disabled) {
                      return
                    }
                    void linkTo(h)
                  }
                  return (
                    <li
                      key={h.id}
                      className={`row related-list__row${disabled ? ' related-list__row--disabled' : ''}`}
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      aria-disabled={disabled}
                      aria-label={`${h.name} 연결`}
                      onClick={triggerLink}
                      onKeyDown={(e) => {
                        if (disabled) {
                          return
                        }
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          triggerLink()
                        }
                      }}
                    >
                      <div className="name" title={h.name}>
                        {h.name}
                      </div>
                      <div className="birth">{birth}</div>
                      <div className="phone">
                        <span>{phone}</span>
                        {alreadyLinked ? (
                          <span className="related-list__linked" aria-label="이미 연결됨">
                            연결됨
                          </span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
                {hits.length === 0 && !searchBusy ? (
                  <li className="related-list__empty">검색 결과가 없습니다.</li>
                ) : null}
              </ul>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <FormButton
                htmlType="button"
                variant="action"
                className="filter-button"
                disabled={linking}
                onClick={() => void requestCloseRelationsModal()}
              >
                닫기
              </FormButton>
            </div>
          </div>
        </div>
      ) : null}
      {confirmDialog}
    </section>
  )
}
