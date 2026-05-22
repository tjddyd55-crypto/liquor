import { useMemo, useState, type ReactNode } from 'react'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import {
  createLiquorSupportContract,
  mapLiquorSupportContract,
  updateLiquorSupportContract,
  type LiquorSupportContract,
  type LiquorSupportContractInput,
} from './liquorSupportContractClient'
import {
  formatLiquorWon,
  LIQUOR_CONTRACT_STATUS_LABELS,
  LIQUOR_SUPPORT_TYPE_LABELS,
} from './liquorCustomerUi'

type Props = {
  customerId: number
  token: string
  contracts: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
}

type FormState = LiquorSupportContractInput & {
  repaidAmount?: number
  balanceAmount?: number
  adjustedAt?: string | null
}

function toFormState(c: LiquorSupportContract): FormState {
  return {
    contractName: c.contractName,
    supportType: c.supportType,
    supportDate: c.supportDate,
    supportAmount: c.supportAmount,
    supportDescription: c.supportDescription,
    supportConditions: c.supportConditions,
    agreementStartOn: c.agreementStartOn,
    agreementEndOn: c.agreementEndOn,
    repaymentRequired: c.repaymentRequired,
    repaymentStartOn: c.repaymentStartOn,
    repaymentDueOn: c.repaymentDueOn,
    totalRepaymentPlannedAmount: c.totalRepaymentPlannedAmount,
    adjustmentAmount: c.adjustmentAmount,
    adjustmentReason: c.adjustmentReason,
    status: c.status,
    memo: c.memo,
    repaidAmount: c.repaidAmount,
    balanceAmount: c.balanceAmount,
    adjustedAt: c.adjustedAt,
  }
}

function parseAmountInput(raw: string): number {
  const n = Number(String(raw).replace(/,/g, '').trim())
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={'liquor-support-contract__field' + (wide ? ' liquor-support-contract__field--wide' : '')}>
      {label}
      {children}
    </label>
  )
}

function SupportContractEditForm({
  form,
  baselineAdjustment,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  form: FormState
  baselineAdjustment: number
  saving: boolean
  onChange: (patch: Partial<FormState>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const adjustmentChanged = Number(form.adjustmentAmount ?? 0) !== baselineAdjustment

  return (
    <div className="liquor-support-contract__edit">
      <div className="liquor-customer-form-grid">
        <Field label="지원계약명">
          <FormInput value={form.contractName ?? ''} onChange={(e) => onChange({ contractName: e.target.value })} />
        </Field>
        <Field label="지원유형">
          <FormSelect value={String(form.supportType ?? 'other')} onChange={(e) => onChange({ supportType: e.target.value })}>
            {Object.entries(LIQUOR_SUPPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormSelect>
        </Field>
        <Field label="상태">
          <FormSelect value={String(form.status ?? 'draft')} onChange={(e) => onChange({ status: e.target.value })}>
            {Object.entries(LIQUOR_CONTRACT_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormSelect>
        </Field>
        <Field label="지원일자">
          <FormInput
            type="date"
            value={form.supportDate ?? ''}
            onChange={(e) => onChange({ supportDate: e.target.value || null })}
          />
        </Field>
        <Field label="지원금액">
          <FormInput
            type="number"
            min={0}
            step={1}
            value={form.supportAmount ?? 0}
            onChange={(e) => onChange({ supportAmount: parseAmountInput(e.target.value) })}
          />
        </Field>
        <Field label="총 상환 예정금액">
          <FormInput
            type="number"
            min={0}
            step={1}
            value={form.totalRepaymentPlannedAmount ?? 0}
            onChange={(e) => onChange({ totalRepaymentPlannedAmount: parseAmountInput(e.target.value) })}
          />
        </Field>
        <Field label="상환완료금액 (자동)">
          <FormInput value={formatLiquorWon(form.repaidAmount ?? 0)} readOnly disabled className="field--readonly" />
        </Field>
        <Field label="조정금액">
          <FormInput
            type="number"
            step={1}
            value={form.adjustmentAmount ?? 0}
            onChange={(e) => onChange({ adjustmentAmount: parseAmountInput(e.target.value) })}
          />
        </Field>
        <Field label="잔액 (자동)">
          <FormInput value={formatLiquorWon(form.balanceAmount ?? 0)} readOnly disabled className="field--readonly" />
        </Field>
        <Field label="약정 시작일">
          <FormInput
            type="date"
            value={form.agreementStartOn ?? ''}
            onChange={(e) => onChange({ agreementStartOn: e.target.value || null })}
          />
        </Field>
        <Field label="약정 종료일">
          <FormInput
            type="date"
            value={form.agreementEndOn ?? ''}
            onChange={(e) => onChange({ agreementEndOn: e.target.value || null })}
          />
        </Field>
        <Field label="상환 필요">
          <FormSelect
            value={form.repaymentRequired ? 'yes' : 'no'}
            onChange={(e) => onChange({ repaymentRequired: e.target.value === 'yes' })}
          >
            <option value="yes">예</option>
            <option value="no">아니오</option>
          </FormSelect>
        </Field>
        <Field label="상환 시작일">
          <FormInput
            type="date"
            value={form.repaymentStartOn ?? ''}
            onChange={(e) => onChange({ repaymentStartOn: e.target.value || null })}
          />
        </Field>
        <Field label="상환 만기일">
          <FormInput
            type="date"
            value={form.repaymentDueOn ?? ''}
            onChange={(e) => onChange({ repaymentDueOn: e.target.value || null })}
          />
        </Field>
        <Field label={'조정사유' + (adjustmentChanged ? ' (필수)' : '')} wide>
          <FormTextarea
            value={form.adjustmentReason ?? ''}
            rows={2}
            placeholder={adjustmentChanged ? '조정금액 변경 시 사유를 입력하세요.' : '조정금액 변경 시에만 필요합니다.'}
            onChange={(e) => onChange({ adjustmentReason: e.target.value })}
          />
        </Field>
        <Field label="지원내용" wide>
          <FormTextarea
            value={form.supportDescription ?? ''}
            rows={2}
            onChange={(e) => onChange({ supportDescription: e.target.value })}
          />
        </Field>
        <Field label="지원조건" wide>
          <FormTextarea
            value={form.supportConditions ?? ''}
            rows={2}
            onChange={(e) => onChange({ supportConditions: e.target.value })}
          />
        </Field>
        <Field label="메모" wide>
          <FormTextarea value={form.memo ?? ''} rows={2} onChange={(e) => onChange({ memo: e.target.value })} />
        </Field>
      </div>
      {form.adjustedAt ? (
        <p className="liquor-customer-panel__muted">
          최근 조정: {String(form.adjustedAt).slice(0, 16).replace('T', ' ')}
        </p>
      ) : null}
      <div className="liquor-support-contract__actions">
        <FormButton type="button" disabled={saving} onClick={onSave}>
          {saving ? '저장 중…' : '저장'}
        </FormButton>
        <FormButton type="button" disabled={saving} onClick={onCancel}>
          취소
        </FormButton>
      </div>
    </div>
  )
}

export function LiquorSupportContractsSection({ customerId, token, contracts, onChanged }: Props) {
  const mapped = useMemo(() => contracts.map(mapLiquorSupportContract), [contracts])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [draft, setDraft] = useState<FormState | null>(null)
  const [baselineAdjustment, setBaselineAdjustment] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [newName, setNewName] = useState('')
  const [newAmount, setNewAmount] = useState('')
  const [newType, setNewType] = useState('liquor_loan')
  const [creating, setCreating] = useState(false)

  const openEdit = (c: LiquorSupportContract) => {
    setExpandedId(c.id)
    setDraft(toFormState(c))
    setBaselineAdjustment(c.adjustmentAmount)
    setMessage(null)
  }

  const closeEdit = () => {
    setExpandedId(null)
    setDraft(null)
    setMessage(null)
  }

  const handleSave = async () => {
    if (!draft || expandedId == null) return
    const adj = Number(draft.adjustmentAmount ?? 0)
    if (adj !== baselineAdjustment && !String(draft.adjustmentReason ?? '').trim()) {
      setMessage({ tone: 'err', text: '조정금액을 변경했습니다. 조정사유를 입력해 주세요.' })
      return
    }
    if (Number(draft.supportAmount ?? 0) < 0 || Number(draft.totalRepaymentPlannedAmount ?? 0) < 0) {
      setMessage({ tone: 'err', text: '금액은 0 이상이어야 합니다.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      const { repaidAmount: _r, balanceAmount: _b, adjustedAt: _a, ...payload } = draft
      await updateLiquorSupportContract(token, customerId, expandedId, payload)
      setMessage({ tone: 'ok', text: '지원계약이 저장되었습니다.' })
      await onChanged()
      closeEdit()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setMessage(null)
    try {
      const amount = parseAmountInput(newAmount)
      await createLiquorSupportContract(token, customerId, {
        contractName: newName,
        supportType: newType,
        supportAmount: amount,
        totalRepaymentPlannedAmount: amount,
        repaymentRequired: true,
        status: 'draft',
      })
      setNewName('')
      setNewAmount('')
      setMessage({ tone: 'ok', text: '지원계약이 추가되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '추가에 실패했습니다.' })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="liquor-customer-panel__section">
      {message ? (
        <p
          className={
            message.tone === 'ok'
              ? 'liquor-support-contract__msg liquor-support-contract__msg--ok'
              : 'liquor-support-contract__msg liquor-support-contract__msg--err'
          }
        >
          {message.text}
        </p>
      ) : null}

      <ul className="liquor-support-contract__list">
        {mapped.map((c) => {
          const open = expandedId === c.id
          return (
            <li key={c.id} className={'liquor-support-contract' + (open ? ' liquor-support-contract--open' : '')}>
              <button type="button" className="liquor-support-contract__summary" onClick={() => (open ? closeEdit() : openEdit(c))}>
                <span className="liquor-support-contract__summary-title">{c.contractName || '(이름 없음)'}</span>
                <span className="liquor-support-contract__summary-meta">
                  {LIQUOR_SUPPORT_TYPE_LABELS[c.supportType] ?? c.supportType}
                  {' · '}
                  {formatLiquorWon(c.supportAmount)}
                  {' · '}
                  {LIQUOR_CONTRACT_STATUS_LABELS[c.status] ?? c.status}
                  {' · 잔액 '}
                  {formatLiquorWon(c.balanceAmount)}
                </span>
                <span className="liquor-support-contract__chevron" aria-hidden>
                  {open ? '▲' : '▼'}
                </span>
              </button>
              {open && draft ? (
                <SupportContractEditForm
                  form={draft}
                  baselineAdjustment={baselineAdjustment}
                  saving={saving}
                  onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))}
                  onSave={() => void handleSave()}
                  onCancel={closeEdit}
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      {mapped.length === 0 ? <p className="liquor-customer-panel__muted">등록된 지원계약이 없습니다.</p> : null}

      <div className="liquor-support-contract__create">
        <h3 className="liquor-support-contract__create-title">지원계약 추가</h3>
        <div className="liquor-customer-inline-form liquor-customer-inline-form--stack">
          <FormInput placeholder="지원계약명" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <FormSelect value={newType} onChange={(e) => setNewType(e.target.value)}>
            {Object.entries(LIQUOR_SUPPORT_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FormSelect>
          <FormInput placeholder="지원금액" type="number" min={0} value={newAmount} onChange={(e) => setNewAmount(e.target.value)} />
          <FormButton type="button" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? '추가 중…' : '지원계약 추가'}
          </FormButton>
        </div>
      </div>
    </div>
  )
}
