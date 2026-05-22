import { useMemo, useState, type ReactNode } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import {
  cancelLiquorRepayment,
  createLiquorRepayment,
  mapLiquorRepayment,
  updateLiquorRepayment,
  validateLiquorRepaymentInput,
  type LiquorRepayment,
  type LiquorRepaymentInput,
} from './liquorRepaymentClient'
import {
  formatLiquorWon,
  LIQUOR_REPAYMENT_METHOD_LABELS,
  LIQUOR_REPAYMENT_METHOD_OPTIONS,
} from './liquorCustomerUi'
import { mapLiquorSupportContract } from './liquorSupportContractClient'
import { LiquorRepaymentImportSection } from './LiquorRepaymentImportSection'

type Props = {
  customerId: number
  token: string
  contracts: Array<Record<string, unknown>>
  repayments: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
  onOpenFilesTab?: () => void
}

type FormState = LiquorRepaymentInput & {
  balanceAfter?: number
}

function parseAmountInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

function toFormState(r: LiquorRepayment): FormState {
  return {
    repaidOn: r.repaidOn,
    amount: r.amount,
    method: r.method,
    depositorName: r.depositorName,
    depositAccount: r.depositAccount,
    memo: r.memo,
    balanceAfter: r.balanceAfter,
  }
}

function emptyCreateForm(contractId: string): FormState & { contractId: string } {
  return {
    contractId,
    repaidOn: new Date().toISOString().slice(0, 10),
    amount: 0,
    method: 'bank_transfer',
    depositorName: '',
    depositAccount: '',
    memo: '',
  }
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={'liquor-repayment__field' + (wide ? ' liquor-repayment__field--wide' : '')}>
      {label}
      {children}
    </label>
  )
}

function contractLabel(
  contracts: Array<Record<string, unknown>>,
  supportContractId: number,
): string {
  const c = contracts.find((row) => Number(row.id) === supportContractId)
  if (!c) return `계약 #${supportContractId}`
  return String(c.contractName ?? c.contract_name ?? `계약 #${supportContractId}`)
}

export function LiquorRepaymentsSection({
  customerId,
  token,
  contracts,
  repayments,
  onChanged,
  onOpenFilesTab,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const mappedContracts = useMemo(() => contracts.map(mapLiquorSupportContract), [contracts])
  const mapped = useMemo(() => repayments.map(mapLiquorRepayment), [repayments])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<FormState | null>(null)
  const [editingContractId, setEditingContractId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [cancelingId, setCancelingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [createForm, setCreateForm] = useState(() => emptyCreateForm(''))
  const [creating, setCreating] = useState(false)

  const openEdit = (r: LiquorRepayment) => {
    setEditingId(r.id)
    setEditingContractId(r.supportContractId)
    setDraft(toFormState(r))
    setMessage(null)
  }

  const closeEdit = () => {
    setEditingId(null)
    setEditingContractId(null)
    setDraft(null)
  }

  const handleSave = async () => {
    if (!draft || editingId == null || editingContractId == null) return
    const err = validateLiquorRepaymentInput(draft)
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await updateLiquorRepayment(token, customerId, editingContractId, editingId, draft)
      setMessage({ tone: 'ok', text: '상환내역이 저장되었습니다.' })
      await onChanged()
      closeEdit()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = async (r: LiquorRepayment) => {
    const ok = await confirm({
      title: '상환내역 취소',
      message: `${r.repaidOn ?? '—'} · ${formatLiquorWon(r.amount)} 상환내역을 취소할까요? 취소 후 잔액이 다시 계산됩니다.`,
      confirmLabel: '취소 처리',
      cancelLabel: '닫기',
      tone: 'danger',
    })
    if (!ok) return
    setCancelingId(r.id)
    setMessage(null)
    try {
      await cancelLiquorRepayment(token, customerId, r.supportContractId, r.id)
      if (editingId === r.id) closeEdit()
      setMessage({ tone: 'ok', text: '상환내역이 취소되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '취소에 실패했습니다.' })
    } finally {
      setCancelingId(null)
    }
  }

  const handleCreate = async () => {
    const cid = Number(createForm.contractId)
    if (!cid) {
      setMessage({ tone: 'err', text: '지원계약을 선택해 주세요.' })
      return
    }
    const err = validateLiquorRepaymentInput({ amount: parseAmountInput(String(createForm.amount ?? '')) })
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setCreating(true)
    setMessage(null)
    try {
      await createLiquorRepayment(token, customerId, cid, {
        repaidOn: createForm.repaidOn,
        amount: parseAmountInput(String(createForm.amount ?? '')),
        method: createForm.method,
        depositorName: createForm.depositorName,
        depositAccount: createForm.depositAccount,
        memo: createForm.memo,
      })
      setCreateForm(emptyCreateForm(createForm.contractId))
      setMessage({ tone: 'ok', text: '상환내역이 등록되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '등록에 실패했습니다.' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="liquor-customer-panel__section">
      {confirmDialog}
      {message ? (
        <p
          className={
            message.tone === 'ok'
              ? 'liquor-repayment__msg liquor-repayment__msg--ok'
              : 'liquor-repayment__msg liquor-repayment__msg--err'
          }
        >
          {message.text}
        </p>
      ) : null}

      <ul className="liquor-repayment__list">
        {mapped.map((r) => {
          const editing = editingId === r.id
          return (
            <li key={r.id} className={'liquor-repayment' + (editing ? ' liquor-repayment--open' : '')}>
              <div className="liquor-repayment__header">
                <div className="liquor-repayment__summary">
                  <span className="liquor-repayment__amount">{formatLiquorWon(r.amount)}</span>
                  <span className="liquor-repayment__meta">
                    {r.repaidOn ?? '—'} · {LIQUOR_REPAYMENT_METHOD_LABELS[r.method] ?? r.method}
                  </span>
                  <span className="liquor-repayment__meta">
                    {contractLabel(contracts, r.supportContractId)}
                    {r.depositorName.trim() ? ` · ${r.depositorName.trim()}` : ''}
                  </span>
                  <span className="liquor-repayment__meta">
                    상환 후 잔액 {formatLiquorWon(r.balanceAfter)}
                    {r.processedByName ? ` · 처리 ${r.processedByName}` : ''}
                  </span>
                  {r.linkedFileCount > 0 ? (
                    <span className="liquor-repayment__files">
                      첨부 {r.linkedFileCount}건
                      {onOpenFilesTab ? (
                        <>
                          {' · '}
                          <button type="button" className="liquor-customer-panel__link" onClick={onOpenFilesTab}>
                            첨부문서 탭
                          </button>
                        </>
                      ) : null}
                    </span>
                  ) : null}
                  {r.memo.trim() ? <span className="liquor-repayment__memo">{r.memo.trim()}</span> : null}
                </div>
                <div className="liquor-repayment__toolbar">
                  <FormButton type="button" disabled={saving || cancelingId != null} onClick={() => (editing ? closeEdit() : openEdit(r))}>
                    {editing ? '닫기' : '수정'}
                  </FormButton>
                  <FormButton type="button" disabled={saving || cancelingId === r.id} onClick={() => void handleCancel(r)}>
                    {cancelingId === r.id ? '취소 중…' : '취소'}
                  </FormButton>
                </div>
              </div>
              {editing && draft ? (
                <div className="liquor-repayment__edit">
                  <div className="liquor-customer-form-grid">
                    <Field label="상환일자">
                      <FormInput
                        type="date"
                        value={draft.repaidOn ?? ''}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, repaidOn: e.target.value || null } : prev))}
                      />
                    </Field>
                    <Field label="상환금액">
                      <FormInput
                        type="number"
                        min={0}
                        step={1}
                        value={String(draft.amount ?? '')}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, amount: parseAmountInput(e.target.value) } : prev))}
                      />
                    </Field>
                    <Field label="상환방식">
                      <FormSelect
                        value={String(draft.method ?? 'other')}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, method: e.target.value } : prev))}
                      >
                        {LIQUOR_REPAYMENT_METHOD_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {LIQUOR_REPAYMENT_METHOD_LABELS[m]}
                          </option>
                        ))}
                      </FormSelect>
                    </Field>
                    <Field label="입금자명">
                      <FormInput
                        value={draft.depositorName ?? ''}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, depositorName: e.target.value } : prev))}
                      />
                    </Field>
                    <Field label="입금계좌">
                      <FormInput
                        value={draft.depositAccount ?? ''}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, depositAccount: e.target.value } : prev))}
                      />
                    </Field>
                    <Field label="상환 후 잔액 (자동)">
                      <FormInput readOnly value={formatLiquorWon(Number(draft.balanceAfter ?? 0))} />
                    </Field>
                    <Field label="메모" wide>
                      <FormTextarea
                        rows={2}
                        value={draft.memo ?? ''}
                        onChange={(e) => setDraft((prev) => (prev ? { ...prev, memo: e.target.value } : prev))}
                      />
                    </Field>
                  </div>
                  <div className="liquor-repayment__actions">
                    <FormButton type="button" disabled={saving} onClick={() => void handleSave()}>
                      {saving ? '저장 중…' : '저장'}
                    </FormButton>
                    <FormButton type="button" disabled={saving} onClick={closeEdit}>
                      닫기
                    </FormButton>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {mapped.length === 0 ? <p className="liquor-customer-panel__muted">등록된 상환내역이 없습니다.</p> : null}

      {mappedContracts.length > 0 ? (
        <div className="liquor-repayment__create">
          <h3 className="liquor-repayment__create-title">상환 등록</h3>
          <div className="liquor-customer-form-grid">
            <Field label="지원계약">
              <FormSelect
                value={createForm.contractId}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, contractId: e.target.value }))}
              >
                <option value="">선택</option>
                {mappedContracts.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    {c.contractName || `(계약 #${c.id})`} · 잔액 {formatLiquorWon(c.balanceAmount)}
                  </option>
                ))}
              </FormSelect>
            </Field>
            <Field label="상환일자">
              <FormInput
                type="date"
                value={createForm.repaidOn ?? ''}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, repaidOn: e.target.value || null }))}
              />
            </Field>
            <Field label="상환금액">
              <FormInput
                placeholder="금액"
                type="number"
                min={0}
                value={String(createForm.amount ?? '')}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, amount: parseAmountInput(e.target.value) }))}
              />
            </Field>
            <Field label="상환방식">
              <FormSelect
                value={String(createForm.method ?? 'bank_transfer')}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, method: e.target.value }))}
              >
                {LIQUOR_REPAYMENT_METHOD_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {LIQUOR_REPAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </FormSelect>
            </Field>
            <Field label="입금자명">
              <FormInput
                value={createForm.depositorName ?? ''}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, depositorName: e.target.value }))}
              />
            </Field>
            <Field label="입금계좌">
              <FormInput
                value={createForm.depositAccount ?? ''}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, depositAccount: e.target.value }))}
              />
            </Field>
            <Field label="메모" wide>
              <FormTextarea
                rows={2}
                value={createForm.memo ?? ''}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, memo: e.target.value }))}
              />
            </Field>
          </div>
          <div className="liquor-repayment__actions">
            <FormButton type="button" disabled={creating} onClick={() => void handleCreate()}>
              {creating ? '등록 중…' : '상환 등록'}
            </FormButton>
          </div>
        </div>
      ) : (
        <p className="liquor-customer-panel__muted">먼저 지원계약을 추가하세요.</p>
      )}

      <LiquorRepaymentImportSection
        token={token}
        defaultCustomerId={customerId}
        defaultContracts={contracts}
        onChanged={onChanged}
      />
    </div>
  )
}
