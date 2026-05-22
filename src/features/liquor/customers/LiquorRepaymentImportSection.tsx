import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FormButton, FormSelect } from '../../../components/form'
import { listCustomers } from '../../customers/api/customersApi'
import { fetchLiquorCustomerDetail } from './liquorCustomerApiClient'
import { formatLiquorWon } from './liquorCustomerUi'
import {
  confirmRepaymentImportRowApi,
  deactivateRepaymentMatchAlias,
  listRepaymentImportBatches,
  listRepaymentImportRows,
  listRepaymentMatchAliases,
  repaymentImportStatusLabel,
  uploadRepaymentImportBatch,
  type RepaymentImportBatch,
  type RepaymentImportMatchStatus,
  type RepaymentImportRow,
  type RepaymentMatchAlias,
} from './liquorRepaymentImportClient'

type Props = {
  token: string
  defaultCustomerId: number
  defaultContracts: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: '전체' },
  { value: 'unmatched', label: '미매칭' },
  { value: 'exact_alias_matched', label: '별칭 정확 일치' },
  { value: 'conflict', label: '별칭 충돌' },
  { value: 'duplicate', label: '중복' },
  { value: 'confirmed', label: '확정됨' },
  { value: 'ignored', label: '무시(출금)' },
  { value: 'failed', label: '실패' },
]

type RowDraft = {
  customerId: string
  supportContractId: string
  saveAlias: boolean
}

function contractOptionsFromDetail(contracts: Array<Record<string, unknown>>) {
  return contracts.map((c) => ({
    id: Number(c.id),
    label: String(c.contractName ?? c.contract_name ?? `계약 #${c.id}`),
  }))
}

function statusTone(status: RepaymentImportMatchStatus): string {
  if (status === 'exact_alias_matched') return 'liquor-import-row__status--match'
  if (status === 'conflict') return 'liquor-import-row__status--conflict'
  if (status === 'confirmed') return 'liquor-import-row__status--confirmed'
  if (status === 'duplicate') return 'liquor-import-row__status--duplicate'
  if (status === 'failed') return 'liquor-import-row__status--failed'
  return ''
}

export function LiquorRepaymentImportSection({ token, defaultCustomerId, defaultContracts, onChanged }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [batches, setBatches] = useState<RepaymentImportBatch[]>([])
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [rows, setRows] = useState<RepaymentImportRow[]>([])
  const [aliases, setAliases] = useState<RepaymentMatchAlias[]>([])
  const [customers, setCustomers] = useState<Array<{ id: number; name: string }>>([])
  const [contractCache, setContractCache] = useState<Record<number, Array<{ id: number; label: string }>>>({})
  const [drafts, setDrafts] = useState<Record<number, RowDraft>>({})
  const [uploading, setUploading] = useState(false)
  const [loadingRows, setLoadingRows] = useState(false)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [showAliases, setShowAliases] = useState(false)

  const defaultContractId = useMemo(() => {
    const first = defaultContracts[0]
    return first ? String(first.id) : ''
  }, [defaultContracts])

  const loadBatches = useCallback(async () => {
    const list = await listRepaymentImportBatches(token)
    setBatches(list)
    if (!selectedBatchId && list.length) {
      setSelectedBatchId(list[0].id)
    }
  }, [token, selectedBatchId])

  const loadRows = useCallback(async () => {
    if (!selectedBatchId) {
      setRows([])
      return
    }
    setLoadingRows(true)
    try {
      const list = await listRepaymentImportRows(token, selectedBatchId, statusFilter || undefined)
      setRows(list)
      setDrafts((prev) => {
        const next = { ...prev }
        for (const row of list) {
          if (next[row.id]) continue
          const customerId =
            row.matchedCustomerId != null ? String(row.matchedCustomerId) : String(defaultCustomerId)
          const contracts = contractCache[Number(customerId)] ?? contractOptionsFromDetail(defaultContracts)
          const supportContractId =
            row.matchedSupportContractId != null
              ? String(row.matchedSupportContractId)
              : contracts[0]?.id != null
                ? String(contracts[0].id)
                : defaultContractId
          next[row.id] = {
            customerId,
            supportContractId,
            saveAlias: true,
          }
        }
        return next
      })
    } finally {
      setLoadingRows(false)
    }
  }, [token, selectedBatchId, statusFilter, defaultCustomerId, defaultContractId, contractCache, defaultContracts])

  const loadAliases = useCallback(async () => {
    const list = await listRepaymentMatchAliases(token)
    setAliases(list)
  }, [token])

  useEffect(() => {
    void loadBatches().catch(() => {})
    void listCustomers(token)
      .then((res) => setCustomers(res.customers.map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {})
    void loadAliases().catch(() => {})
  }, [token, loadBatches, loadAliases])

  useEffect(() => {
    void loadRows().catch(() => {})
  }, [loadRows])

  useEffect(() => {
    const seeded = contractOptionsFromDetail(defaultContracts)
    if (seeded.length) {
      setContractCache((prev) => ({ ...prev, [defaultCustomerId]: seeded }))
    }
  }, [defaultCustomerId, defaultContracts])

  const ensureContracts = async (customerId: number) => {
    if (contractCache[customerId]?.length) return contractCache[customerId]
    const detail = await fetchLiquorCustomerDetail(token, customerId)
    const options = contractOptionsFromDetail(detail.supportContracts ?? [])
    setContractCache((prev) => ({ ...prev, [customerId]: options }))
    return options
  }

  const handleUpload = async (file: File | null) => {
    if (!file) return
    setUploading(true)
    setMessage(null)
    try {
      const { batch, parseErrors } = await uploadRepaymentImportBatch(token, file)
      setSelectedBatchId(batch.id)
      await loadBatches()
      await loadRows()
      await loadAliases()
      const errHint = parseErrors.length ? ` (파싱 경고 ${parseErrors.length}건)` : ''
      setMessage({ tone: 'ok', text: `업로드 완료 · ${batch.rowCount}건${errHint}` })
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '업로드에 실패했습니다.' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const updateDraft = (rowId: number, patch: Partial<RowDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [rowId]: { ...(prev[rowId] ?? { customerId: String(defaultCustomerId), supportContractId: defaultContractId, saveAlias: true }), ...patch },
    }))
  }

  const handleCustomerChange = async (rowId: number, customerId: string) => {
    const cid = Number(customerId)
    const contracts = await ensureContracts(cid)
    updateDraft(rowId, {
      customerId,
      supportContractId: contracts[0] ? String(contracts[0].id) : '',
    })
  }

  const handleConfirm = async (row: RepaymentImportRow) => {
    if (row.matchStatus === 'confirmed') return
    if (row.direction !== 'deposit') return
    const draft = drafts[row.id]
    if (!draft?.customerId || !draft.supportContractId) {
      setMessage({ tone: 'err', text: '거래처와 지원계약을 선택해 주세요.' })
      return
    }
    setConfirmingId(row.id)
    setMessage(null)
    try {
      await confirmRepaymentImportRowApi(token, row.id, {
        customerId: Number(draft.customerId),
        supportContractId: Number(draft.supportContractId),
        saveAlias: draft.saveAlias,
      })
      setMessage({ tone: 'ok', text: `"${row.depositorName}" 상환을 확정했습니다.` })
      await loadBatches()
      await loadRows()
      await loadAliases()
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '확정에 실패했습니다.' })
    } finally {
      setConfirmingId(null)
    }
  }

  const handleDeactivateAlias = async (aliasId: number) => {
    setDeactivatingId(aliasId)
    try {
      await deactivateRepaymentMatchAlias(token, aliasId)
      await loadAliases()
      await loadRows()
      setMessage({ tone: 'ok', text: '별칭을 비활성화했습니다.' })
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '별칭 비활성화에 실패했습니다.' })
    } finally {
      setDeactivatingId(null)
    }
  }

  return (
    <section className="liquor-import">
      <header className="liquor-import__header">
        <div>
          <h3 className="liquor-import__title">상환 가져오기</h3>
          <p className="liquor-customer-panel__muted">
            엑셀 입금 내역을 업로드합니다. 자동 후보는 저장된 입금자명 별칭과 정확히 일치할 때만 표시됩니다.
          </p>
        </div>
        <div className="liquor-import__upload">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="liquor-import__file-input"
            onChange={(e) => void handleUpload(e.target.files?.[0] ?? null)}
          />
          <FormButton type="button" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? '업로드 중…' : '엑셀 업로드'}
          </FormButton>
        </div>
      </header>

      {message ? (
        <p className={'liquor-import__msg' + (message.tone === 'ok' ? ' liquor-import__msg--ok' : ' liquor-import__msg--err')}>
          {message.text}
        </p>
      ) : null}

      <div className="liquor-import__toolbar">
        <label className="liquor-import__filter">
          배치
          <FormSelect
            value={selectedBatchId != null ? String(selectedBatchId) : ''}
            onChange={(e) => setSelectedBatchId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">선택</option>
            {batches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.originalFileName || `배치 #${b.id}`} · {b.rowCount}건 · {b.createdAt.slice(0, 16).replace('T', ' ')}
              </option>
            ))}
          </FormSelect>
        </label>
        <label className="liquor-import__filter">
          상태
          <FormSelect value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            {STATUS_FILTERS.map((f) => (
              <option key={f.value || 'all'} value={f.value}>
                {f.label}
              </option>
            ))}
          </FormSelect>
        </label>
        <FormButton type="button" variant="secondary" onClick={() => setShowAliases((v) => !v)}>
          {showAliases ? '별칭 목록 닫기' : '별칭 목록'}
        </FormButton>
      </div>

      {showAliases ? (
        <ul className="liquor-import-alias__list">
          {aliases.length === 0 ? (
            <li className="liquor-customer-panel__muted">등록된 별칭이 없습니다.</li>
          ) : (
            aliases.map((a) => (
              <li key={a.id} className={'liquor-import-alias' + (a.isActive ? '' : ' liquor-import-alias--inactive')}>
                <span className="liquor-import-alias__value">{a.aliasValue}</span>
                <span className="liquor-import-alias__meta">거래처 #{a.customerId}</span>
                <span className="liquor-import-alias__meta">사용 {a.usageCount}회</span>
                {a.isActive ? (
                  <FormButton
                    type="button"
                    variant="secondary"
                    disabled={deactivatingId === a.id}
                    onClick={() => void handleDeactivateAlias(a.id)}
                  >
                    비활성화
                  </FormButton>
                ) : (
                  <span className="liquor-import-alias__inactive-label">비활성</span>
                )}
              </li>
            ))
          )}
        </ul>
      ) : null}

      {loadingRows ? <p className="liquor-customer-panel__muted">불러오는 중…</p> : null}

      <ul className="liquor-import-row__list">
        {rows.map((row) => {
          const draft = drafts[row.id]
          const contracts =
            contractCache[Number(draft?.customerId)] ?? contractOptionsFromDetail(defaultContracts)
          const canConfirm =
            row.matchStatus !== 'confirmed' &&
            row.matchStatus !== 'duplicate' &&
            row.direction === 'deposit' &&
            row.matchStatus !== 'ignored'
          return (
            <li key={row.id} className="liquor-import-row">
              <div className="liquor-import-row__summary">
                <span className="liquor-import-row__amount">{formatLiquorWon(row.amount)}</span>
                <span className="liquor-import-row__meta">{row.transactionDate ?? '—'}</span>
                <span className="liquor-import-row__depositor">{row.depositorName || '—'}</span>
                {row.description ? <span className="liquor-import-row__desc">{row.description}</span> : null}
                <span className={'liquor-import-row__status ' + statusTone(row.matchStatus)}>
                  {repaymentImportStatusLabel(row.matchStatus)}
                </span>
                {row.matchReason ? <span className="liquor-import-row__reason">{row.matchReason}</span> : null}
                {row.accountNumberMasked ? (
                  <span className="liquor-import-row__account">계좌 {row.accountNumberMasked}</span>
                ) : null}
              </div>

              {row.matchStatus === 'conflict' ? (
                <p className="liquor-import-row__warn">
                  동일 별칭이 여러 거래처에 등록되어 있습니다. 자동 선택하지 않습니다. 거래처를 직접 선택하세요.
                </p>
              ) : null}

              {canConfirm ? (
                <div className="liquor-import-row__confirm">
                  <label className="liquor-import-row__field">
                    거래처
                    <FormSelect
                      value={draft?.customerId ?? String(defaultCustomerId)}
                      onChange={(e) => void handleCustomerChange(row.id, e.target.value)}
                    >
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="liquor-import-row__field">
                    지원계약
                    <FormSelect
                      value={draft?.supportContractId ?? defaultContractId}
                      onChange={(e) => updateDraft(row.id, { supportContractId: e.target.value })}
                    >
                      <option value="">선택</option>
                      {contracts.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </FormSelect>
                  </label>
                  <label className="liquor-import-row__alias-check">
                    <input
                      type="checkbox"
                      checked={draft?.saveAlias !== false}
                      onChange={(e) => updateDraft(row.id, { saveAlias: e.target.checked })}
                    />
                    이 입금자명을 별칭으로 저장
                  </label>
                  <FormButton
                    type="button"
                    disabled={confirmingId === row.id}
                    onClick={() => void handleConfirm(row)}
                  >
                    {confirmingId === row.id ? '확정 중…' : '확정'}
                  </FormButton>
                </div>
              ) : row.matchStatus === 'confirmed' ? (
                <p className="liquor-customer-panel__muted">확정됨 · 상환 #{row.confirmedRepaymentId ?? '—'}</p>
              ) : null}
            </li>
          )
        })}
      </ul>

      {!loadingRows && selectedBatchId && rows.length === 0 ? (
        <p className="liquor-customer-panel__muted">표시할 row가 없습니다.</p>
      ) : null}
    </section>
  )
}
