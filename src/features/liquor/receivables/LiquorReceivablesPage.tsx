import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FormButton, FormInput, FormSelect } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import { ApiError } from '../../../lib/apiClient'
import {
  formatLiquorWon,
  LIQUOR_CONTRACT_STATUS_LABELS,
  LIQUOR_ITEM_KIND_LABELS,
  LIQUOR_ITEM_STATUS_LABELS,
  LIQUOR_SUPPORT_TYPE_LABELS,
} from '../customers/liquorCustomerUi'
import {
  fetchLiquorReceivablesContracts,
  fetchLiquorReceivablesImportRows,
  fetchLiquorReceivablesSummary,
  fetchLiquorReceivablesSupportItems,
  IMPORT_STATUS_LABELS,
  type LiquorReceivablesContractRow,
  type LiquorReceivablesImportRow,
  type LiquorReceivablesSummary,
  type LiquorReceivablesSupportItemRow,
} from './liquorReceivablesClient'
import './liquor-receivables.css'

type TabId = 'contracts' | 'import' | 'items'

function itemKindLabel(kind: string, other: string): string {
  if (kind === 'other' && other.trim()) return other.trim()
  return LIQUOR_ITEM_KIND_LABELS[kind] ?? kind
}

function SummaryCards({ summary }: { summary: LiquorReceivablesSummary | null }) {
  if (!summary) return null
  const cards = [
    { label: '총 지원금액', value: formatLiquorWon(summary.totalSupportAmount) },
    { label: '총 상환금액', value: formatLiquorWon(summary.totalRepaidAmount) },
    { label: '현재 총 잔액', value: formatLiquorWon(summary.totalBalanceAmount) },
    { label: '연체·회수필요 계약', value: `${summary.overdueOrCollectionCount}건` },
    { label: '상환중 계약', value: `${summary.repayingContractCount}건` },
    { label: '상환완료 계약', value: `${summary.repaidContractCount}건` },
    { label: '미확정 입금', value: `${summary.unmatchedImportRowCount}건` },
    { label: '별칭 충돌 입금', value: `${summary.conflictImportRowCount}건` },
    { label: '회수·관리 필요 물품', value: `${summary.recoveryRequiredItemCount}건` },
    { label: '회수예정·완료 물품', value: `${summary.recoveryScheduledOrRecoveredCount}건` },
  ]
  return (
    <div className="liquor-receivables__cards">
      {cards.map((c) => (
        <div key={c.label} className="liquor-receivables__card">
          <span className="liquor-receivables__card-label">{c.label}</span>
          <span className="liquor-receivables__card-value">{c.value}</span>
        </div>
      ))}
    </div>
  )
}

function CustomerDetailLink({ customerId, label }: { customerId: number; label?: string }) {
  return (
    <Link to={`/customers/${customerId}`} className="liquor-receivables__link">
      {label ?? '상세보기'}
    </Link>
  )
}

export default function LiquorReceivablesPage() {
  const { token } = useAuth()
  const t = token?.trim() ?? ''
  const [tab, setTab] = useState<TabId>('contracts')
  const [summary, setSummary] = useState<LiquorReceivablesSummary | null>(null)
  const [contracts, setContracts] = useState<LiquorReceivablesContractRow[]>([])
  const [importRows, setImportRows] = useState<LiquorReceivablesImportRow[]>([])
  const [supportItems, setSupportItems] = useState<LiquorReceivablesSupportItemRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [supportTypeFilter, setSupportTypeFilter] = useState('')
  const [hasBalanceFilter, setHasBalanceFilter] = useState('')
  const [overdueFilter, setOverdueFilter] = useState('')
  const [searchFilter, setSearchFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const reload = useCallback(async () => {
    if (!t) return
    setLoading(true)
    setError(null)
    try {
      const [sum, contractRes, importRes, itemRes] = await Promise.all([
        fetchLiquorReceivablesSummary(t),
        fetchLiquorReceivablesContracts(t, {
          status: statusFilter || undefined,
          supportType: supportTypeFilter || undefined,
          hasBalance: hasBalanceFilter || undefined,
          overdueDue: overdueFilter || undefined,
          search: searchFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        }),
        fetchLiquorReceivablesImportRows(t),
        fetchLiquorReceivablesSupportItems(t),
      ])
      setSummary(sum)
      setContracts(contractRes.items)
      setImportRows(importRes.items)
      setSupportItems(itemRes.items)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '채권관리 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [t, statusFilter, supportTypeFilter, hasBalanceFilter, overdueFilter, searchFilter, dateFrom, dateTo])

  useEffect(() => {
    void reload()
  }, [reload])

  return (
    <div className="liquor-receivables">
      <header className="liquor-receivables__header">
        <h1>채권관리</h1>
        <p>전체 거래처의 지원·상환·잔액·입금 검토·물품 회수 현황을 조회합니다.</p>
      </header>

      {error ? <p className="liquor-receivables__msg liquor-receivables__msg--err">{error}</p> : null}
      {loading && !summary ? <p className="liquor-receivables__empty">불러오는 중…</p> : null}

      <SummaryCards summary={summary} />

      <div className="liquor-receivables__tabs" role="tablist">
        {(
          [
            ['contracts', '지원계약·채권'],
            ['import', '입금 import 검토'],
            ['items', '회수·관리 물품'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={'liquor-receivables__tab' + (tab === id ? ' liquor-receivables__tab--active' : '')}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'contracts' ? (
        <>
          <div className="liquor-receivables__filters">
            <label className="liquor-receivables__filter">
              상태
              <FormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">전체</option>
                {Object.entries(LIQUOR_CONTRACT_STATUS_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="liquor-receivables__filter">
              지원유형
              <FormSelect value={supportTypeFilter} onChange={(e) => setSupportTypeFilter(e.target.value)}>
                <option value="">전체</option>
                {Object.entries(LIQUOR_SUPPORT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </FormSelect>
            </label>
            <label className="liquor-receivables__filter">
              잔액
              <FormSelect value={hasBalanceFilter} onChange={(e) => setHasBalanceFilter(e.target.value)}>
                <option value="">전체</option>
                <option value="yes">잔액 있음</option>
                <option value="no">잔액 없음</option>
              </FormSelect>
            </label>
            <label className="liquor-receivables__filter">
              만기 경과
              <FormSelect value={overdueFilter} onChange={(e) => setOverdueFilter(e.target.value)}>
                <option value="">전체</option>
                <option value="yes">만기 경과·잔액 있음</option>
              </FormSelect>
            </label>
            <label className="liquor-receivables__filter">
              지원일(from)
              <FormInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </label>
            <label className="liquor-receivables__filter">
              지원일(to)
              <FormInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </label>
            <label className="liquor-receivables__filter liquor-receivables__filter--wide">
              거래처 검색
              <FormInput
                value={searchFilter}
                placeholder="거래처명·대표자·계약명·연락처"
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </label>
            <FormButton type="button" onClick={() => void reload()}>
              필터 적용
            </FormButton>
          </div>

          {contracts.length === 0 ? (
            <p className="liquor-receivables__empty">표시할 지원계약이 없습니다.</p>
          ) : (
            <>
              <div className="liquor-receivables__table-wrap">
                <table className="liquor-receivables__table">
                  <thead>
                    <tr>
                      <th>거래처</th>
                      <th>대표자</th>
                      <th>연락처</th>
                      <th>계약명</th>
                      <th>유형</th>
                      <th>지원일</th>
                      <th>상환예정</th>
                      <th>상환완료</th>
                      <th>조정</th>
                      <th>잔액</th>
                      <th>상태</th>
                      <th>최근상환</th>
                      <th>만기</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((row) => (
                      <tr key={row.id}>
                        <td>{row.customerName}</td>
                        <td>{row.representativeName || '—'}</td>
                        <td>{row.customerPhone || '—'}</td>
                        <td>{row.contractName || '—'}</td>
                        <td>{LIQUOR_SUPPORT_TYPE_LABELS[row.supportType] ?? row.supportType}</td>
                        <td>{row.supportDate ?? '—'}</td>
                        <td>{formatLiquorWon(row.totalRepaymentPlannedAmount)}</td>
                        <td>{formatLiquorWon(row.repaidAmount)}</td>
                        <td>{formatLiquorWon(row.adjustmentAmount)}</td>
                        <td>{formatLiquorWon(row.balanceAmount)}</td>
                        <td>{LIQUOR_CONTRACT_STATUS_LABELS[row.status] ?? row.status}</td>
                        <td>{row.latestRepaymentOn ?? '—'}</td>
                        <td>{row.repaymentDueOn ?? '—'}</td>
                        <td>
                          <CustomerDetailLink customerId={row.customerId} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="liquor-receivables__cards-list">
                {contracts.map((row) => (
                  <article key={row.id} className="liquor-receivables__row-card">
                    <span className="liquor-receivables__row-card-title">{row.customerName}</span>
                    <span className="liquor-receivables__row-card-meta">
                      {row.contractName} · {LIQUOR_CONTRACT_STATUS_LABELS[row.status] ?? row.status}
                    </span>
                    <span className="liquor-receivables__row-card-meta">
                      잔액 {formatLiquorWon(row.balanceAmount)} · 상환 {formatLiquorWon(row.repaidAmount)}
                    </span>
                    <CustomerDetailLink customerId={row.customerId} />
                  </article>
                ))}
              </div>
            </>
          )}
        </>
      ) : null}

      {tab === 'import' ? (
        importRows.length === 0 ? (
          <p className="liquor-receivables__empty">검토가 필요한 입금 import row가 없습니다.</p>
        ) : (
          <>
            <div className="liquor-receivables__table-wrap">
              <table className="liquor-receivables__table">
                <thead>
                  <tr>
                    <th>거래일</th>
                    <th>입금자명</th>
                    <th>금액</th>
                    <th>상태</th>
                    <th>사유</th>
                    <th>batch</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.transactionDate ?? '—'}</td>
                      <td>{row.depositorName || '—'}</td>
                      <td>{formatLiquorWon(row.amount)}</td>
                      <td>{IMPORT_STATUS_LABELS[row.matchStatus] ?? row.matchStatus}</td>
                      <td>{row.matchReason || '—'}</td>
                      <td>{row.batchFileName || `#${row.batchId}`}</td>
                      <td>
                        {row.matchedCustomerId ? (
                          <CustomerDetailLink customerId={row.matchedCustomerId} label="거래처" />
                        ) : (
                          <Link to="/customers" className="liquor-receivables__link">
                            고객리스트
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="liquor-receivables__cards-list">
              {importRows.map((row) => (
                <article key={row.id} className="liquor-receivables__row-card">
                  <span className="liquor-receivables__row-card-title">
                    {row.depositorName || '—'} · {formatLiquorWon(row.amount)}
                  </span>
                  <span className="liquor-receivables__row-card-meta">
                    {row.transactionDate ?? '—'} · {IMPORT_STATUS_LABELS[row.matchStatus] ?? row.matchStatus}
                  </span>
                  <span className="liquor-receivables__row-card-meta">{row.matchReason}</span>
                  {row.matchedCustomerId ? (
                    <CustomerDetailLink customerId={row.matchedCustomerId} />
                  ) : (
                    <Link to="/customers" className="liquor-receivables__link">
                      고객리스트에서 확정
                    </Link>
                  )}
                </article>
              ))}
            </div>
          </>
        )
      ) : null}

      {tab === 'items' ? (
        supportItems.length === 0 ? (
          <p className="liquor-receivables__empty">회수·관리가 필요한 물품이 없습니다.</p>
        ) : (
          <>
            <div className="liquor-receivables__table-wrap">
              <table className="liquor-receivables__table">
                <thead>
                  <tr>
                    <th>거래처</th>
                    <th>물품종류</th>
                    <th>모델명</th>
                    <th>상태</th>
                    <th>회수필요</th>
                    <th>회수예정</th>
                    <th>회수일</th>
                    <th>첨부</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {supportItems.map((row) => (
                    <tr key={row.id}>
                      <td>{row.customerName}</td>
                      <td>{itemKindLabel(row.itemKind, row.itemKindOther)}</td>
                      <td>{row.modelName || '—'}</td>
                      <td>{LIQUOR_ITEM_STATUS_LABELS[row.status] ?? row.status}</td>
                      <td>{row.recoveryRequired ? '예' : '아니오'}</td>
                      <td>{row.recoveryDueOn ?? '—'}</td>
                      <td>{row.recoveredOn ?? '—'}</td>
                      <td>{row.linkedFileCount}건</td>
                      <td>
                        <CustomerDetailLink customerId={row.customerId} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="liquor-receivables__cards-list">
              {supportItems.map((row) => (
                <article key={row.id} className="liquor-receivables__row-card">
                  <span className="liquor-receivables__row-card-title">{row.customerName}</span>
                  <span className="liquor-receivables__row-card-meta">
                    {itemKindLabel(row.itemKind, row.itemKindOther)} · {row.modelName || '—'}
                  </span>
                  <span className="liquor-receivables__row-card-meta">
                    {LIQUOR_ITEM_STATUS_LABELS[row.status] ?? row.status} · 첨부 {row.linkedFileCount}건
                  </span>
                  <CustomerDetailLink customerId={row.customerId} />
                </article>
              ))}
            </div>
          </>
        )
      ) : null}
    </div>
  )
}
