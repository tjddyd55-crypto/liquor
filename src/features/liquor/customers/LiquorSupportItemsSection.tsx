import { useMemo, useState, type ReactNode } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import { LiquorEntityDocumentActions } from './LiquorEntityDocumentActions'
import { mapLiquorCustomerFile } from './liquorCustomerFileClient'
import {
  formatLiquorWon,
  LIQUOR_ITEM_KIND_LABELS,
  LIQUOR_ITEM_KIND_OPTIONS,
  LIQUOR_ITEM_STATUS_LABELS,
  LIQUOR_ITEM_STATUS_OPTIONS,
  LIQUOR_OWNERSHIP_TYPE_LABELS,
  LIQUOR_OWNERSHIP_TYPE_OPTIONS,
} from './liquorCustomerUi'
import { mapLiquorSupportContract } from './liquorSupportContractClient'
import {
  computeSupportItemTotal,
  createLiquorSupportItem,
  deleteLiquorSupportItem,
  mapLiquorSupportItem,
  parseSupportItemAmountInput,
  parseSupportItemQuantityInput,
  updateLiquorSupportItem,
  validateLiquorSupportItemInput,
  type LiquorSupportItem,
  type LiquorSupportItemInput,
} from './liquorSupportItemClient'

type Props = {
  customerId: number
  token: string
  items: Array<Record<string, unknown>>
  contracts: Array<Record<string, unknown>>
  files: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
  onOpenFilesTab?: () => void
}

type FormState = LiquorSupportItemInput & {
  totalManual?: boolean
}

function emptyForm(): FormState {
  return {
    itemKind: 'refrigerator',
    itemKindOther: '',
    modelName: '',
    manufacturer: '',
    quantity: 1,
    unitPrice: 0,
    totalAmount: 0,
    supportedOn: new Date().toISOString().slice(0, 10),
    installedOn: null,
    installLocation: '',
    ownershipType: 'company_owned',
    recoveryRequired: false,
    recoveryDueOn: null,
    recoveredOn: null,
    status: 'planned',
    memo: '',
    supportContractId: null,
    totalManual: false,
  }
}

function toFormState(item: LiquorSupportItem): FormState {
  return {
    supportContractId: item.supportContractId,
    itemKind: item.itemKind,
    itemKindOther: item.itemKindOther,
    modelName: item.modelName,
    manufacturer: item.manufacturer,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalAmount: item.totalAmount,
    supportedOn: item.supportedOn,
    installedOn: item.installedOn,
    installLocation: item.installLocation,
    ownershipType: item.ownershipType || 'company_owned',
    recoveryRequired: item.recoveryRequired,
    recoveryDueOn: item.recoveryDueOn,
    recoveredOn: item.recoveredOn,
    status: item.status,
    memo: item.memo,
    totalManual: item.totalAmount !== computeSupportItemTotal(item.quantity, item.unitPrice),
  }
}

function itemKindLabel(item: LiquorSupportItem): string {
  if (item.itemKind === 'other' && item.itemKindOther.trim()) return item.itemKindOther.trim()
  return LIQUOR_ITEM_KIND_LABELS[item.itemKind] ?? item.itemKind
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={'liquor-support-item__field' + (wide ? ' liquor-support-item__field--wide' : '')}>
      {label}
      {children}
    </label>
  )
}

function SupportItemFormFields({
  form,
  contracts,
  onChange,
}: {
  form: FormState
  contracts: Array<{ id: number; label: string }>
  onChange: (patch: Partial<FormState>) => void
}) {
  const applyQtyUnit = (patch: Partial<FormState>) => {
    const next = { ...form, ...patch }
    if (!next.totalManual) {
      const qty = next.quantity ?? 1
      const unit = next.unitPrice ?? 0
      next.totalAmount = computeSupportItemTotal(qty, unit)
    }
    onChange(next)
  }

  return (
    <div className="liquor-customer-form-grid liquor-support-item__form">
      <Field label="물품종류">
        <FormSelect value={form.itemKind ?? 'other'} onChange={(e) => onChange({ itemKind: e.target.value })}>
          {LIQUOR_ITEM_KIND_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {LIQUOR_ITEM_KIND_LABELS[k]}
            </option>
          ))}
        </FormSelect>
      </Field>
      {form.itemKind === 'other' ? (
        <Field label="기타 물품명">
          <FormInput value={form.itemKindOther ?? ''} onChange={(e) => onChange({ itemKindOther: e.target.value })} />
        </Field>
      ) : null}
      <Field label="모델명">
        <FormInput value={form.modelName ?? ''} onChange={(e) => onChange({ modelName: e.target.value })} />
      </Field>
      <Field label="제조사">
        <FormInput value={form.manufacturer ?? ''} onChange={(e) => onChange({ manufacturer: e.target.value })} />
      </Field>
      <Field label="수량">
        <FormInput
          inputMode="numeric"
          value={String(form.quantity ?? 1)}
          onChange={(e) => {
            const q = parseSupportItemQuantityInput(e.target.value)
            if (!Number.isNaN(q)) applyQtyUnit({ quantity: q })
          }}
        />
      </Field>
      <Field label="단가">
        <FormInput
          inputMode="decimal"
          value={String(form.unitPrice ?? 0)}
          onChange={(e) => {
            const u = parseSupportItemAmountInput(e.target.value)
            if (!Number.isNaN(u)) applyQtyUnit({ unitPrice: u })
          }}
        />
      </Field>
      <Field label="총액">
        <FormInput
          inputMode="decimal"
          value={String(form.totalAmount ?? 0)}
          onChange={(e) => {
            const t = parseSupportItemAmountInput(e.target.value)
            if (!Number.isNaN(t)) onChange({ totalAmount: t, totalManual: true })
          }}
        />
      </Field>
      <Field label="지원일자">
        <FormInput
          type="date"
          value={form.supportedOn ?? ''}
          onChange={(e) => onChange({ supportedOn: e.target.value || null })}
        />
      </Field>
      <Field label="설치일자">
        <FormInput
          type="date"
          value={form.installedOn ?? ''}
          onChange={(e) => onChange({ installedOn: e.target.value || null })}
        />
      </Field>
      <Field label="설치장소">
        <FormInput value={form.installLocation ?? ''} onChange={(e) => onChange({ installLocation: e.target.value })} />
      </Field>
      <Field label="소유권 구분">
        <FormSelect
          value={form.ownershipType ?? ''}
          onChange={(e) => onChange({ ownershipType: e.target.value })}
        >
          <option value="">선택</option>
          {LIQUOR_OWNERSHIP_TYPE_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {LIQUOR_OWNERSHIP_TYPE_LABELS[k]}
            </option>
          ))}
        </FormSelect>
      </Field>
      <Field label="지원계약">
        <FormSelect
          value={form.supportContractId != null ? String(form.supportContractId) : ''}
          onChange={(e) =>
            onChange({ supportContractId: e.target.value ? Number(e.target.value) : null })
          }
        >
          <option value="">연결 없음</option>
          {contracts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </FormSelect>
      </Field>
      <Field label="상태">
        <FormSelect value={form.status ?? 'planned'} onChange={(e) => onChange({ status: e.target.value })}>
          {LIQUOR_ITEM_STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {LIQUOR_ITEM_STATUS_LABELS[s]}
            </option>
          ))}
        </FormSelect>
      </Field>
      <Field label="회수 필요">
        <FormSelect
          value={form.recoveryRequired ? 'yes' : 'no'}
          onChange={(e) => onChange({ recoveryRequired: e.target.value === 'yes' })}
        >
          <option value="no">아니오</option>
          <option value="yes">예</option>
        </FormSelect>
      </Field>
      <Field label="회수 예정일">
        <FormInput
          type="date"
          value={form.recoveryDueOn ?? ''}
          onChange={(e) => onChange({ recoveryDueOn: e.target.value || null })}
        />
      </Field>
      <Field label="회수일">
        <FormInput
          type="date"
          value={form.recoveredOn ?? ''}
          onChange={(e) => onChange({ recoveredOn: e.target.value || null })}
        />
      </Field>
      {form.status === 'recovered' ? (
        <p className="liquor-support-item__hint">회수완료 상태에서는 회수일 입력이 필요합니다.</p>
      ) : null}
      {['broken', 'lost', 'disposed'].includes(String(form.status ?? '')) ? (
        <p className="liquor-support-item__hint">고장/분실/폐기 상태에서는 메모 입력을 권장합니다.</p>
      ) : null}
      <Field label="메모" wide>
        <FormTextarea rows={2} value={form.memo ?? ''} onChange={(e) => onChange({ memo: e.target.value })} />
      </Field>
    </div>
  )
}

export function LiquorSupportItemsSection({
  customerId,
  token,
  items,
  contracts,
  files,
  onChanged,
  onOpenFilesTab,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const mappedContracts = useMemo(
    () =>
      contracts.map((c) => {
        const m = mapLiquorSupportContract(c)
        return { id: m.id, label: m.contractName || `계약 #${m.id}` }
      }),
    [contracts],
  )
  const mappedItems = useMemo(() => items.map(mapLiquorSupportItem), [items])
  const fileCountsByItem = useMemo(() => {
    const counts = new Map<number, number>()
    for (const f of files.map(mapLiquorCustomerFile)) {
      if (f.supportItemId) counts.set(f.supportItemId, (counts.get(f.supportItemId) ?? 0) + 1)
    }
    return counts
  }, [files])

  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<FormState | null>(null)
  const [createForm, setCreateForm] = useState<FormState>(() => emptyForm())
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const handleCreate = async () => {
    const err = validateLiquorSupportItemInput(createForm)
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setCreating(true)
    setMessage(null)
    try {
      await createLiquorSupportItem(token, customerId, createForm)
      setCreateForm(emptyForm())
      setMessage({ tone: 'ok', text: '지원물품이 추가되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '추가에 실패했습니다.' })
    } finally {
      setCreating(false)
    }
  }

  const handleSave = async () => {
    if (!draft || editingId == null) return
    const err = validateLiquorSupportItemInput(draft)
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await updateLiquorSupportItem(token, customerId, editingId, draft)
      setMessage({ tone: 'ok', text: '지원물품이 저장되었습니다.' })
      setEditingId(null)
      setDraft(null)
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (item: LiquorSupportItem) => {
    const ok = await confirm({
      title: '지원물품 삭제',
      message: `"${itemKindLabel(item)}" · ${item.modelName || '모델명 없음'} 항목을 삭제(숨김) 처리할까요?`,
      confirmLabel: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(item.id)
    try {
      await deleteLiquorSupportItem(token, customerId, item.id)
      setMessage({ tone: 'ok', text: '지원물품이 삭제되었습니다.' })
      if (editingId === item.id) {
        setEditingId(null)
        setDraft(null)
      }
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '삭제에 실패했습니다.' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="liquor-support-item">
      {confirmDialog}
      {message ? (
        <p
          className={
            message.tone === 'ok' ? 'liquor-support-item__msg liquor-support-item__msg--ok' : 'liquor-support-item__msg liquor-support-item__msg--err'
          }
        >
          {message.text}
        </p>
      ) : null}

      <ul className="liquor-support-item__list">
        {mappedItems.map((item) => {
          const editing = editingId === item.id
          const linkedCount = fileCountsByItem.get(item.id) ?? item.linkedFileCount ?? 0
          return (
            <li key={item.id} className={'liquor-support-item__card' + (editing ? ' liquor-support-item__card--open' : '')}>
              <div className="liquor-support-item__header">
                <div className="liquor-support-item__summary">
                  <span className="liquor-support-item__kind">{itemKindLabel(item)}</span>
                  <span className="liquor-support-item__model">{item.modelName || '—'}</span>
                  <span className="liquor-support-item__meta">
                    {LIQUOR_ITEM_STATUS_LABELS[item.status] ?? item.status} · 수량 {item.quantity} ·{' '}
                    {formatLiquorWon(item.totalAmount)}
                  </span>
                  {item.manufacturer ? <span className="liquor-support-item__meta">{item.manufacturer}</span> : null}
                  {linkedCount > 0 ? (
                    <span className="liquor-support-item__files">첨부 {linkedCount}건</span>
                  ) : (
                    <span className="liquor-support-item__files liquor-support-item__files--muted">
                      첨부문서 탭에서 이 물품에 연결 가능
                    </span>
                  )}
                </div>
                <div className="liquor-support-item__toolbar">
                  {!editing ? (
                    <>
                      <FormButton type="button" variant="secondary" onClick={() => { setEditingId(item.id); setDraft(toFormState(item)); setMessage(null) }}>
                        수정
                      </FormButton>
                      <FormButton
                        type="button"
                        variant="secondary"
                        disabled={deletingId === item.id}
                        onClick={() => void handleDelete(item)}
                      >
                        {deletingId === item.id ? '삭제 중…' : '삭제'}
                      </FormButton>
                    </>
                  ) : null}
                </div>
              </div>

              {!editing ? (
                <LiquorEntityDocumentActions
                  entityType="support_item"
                  entityId={item.id}
                  customerId={customerId}
                  supportContractId={item.supportContractId}
                  documentCounts={linkedCount}
                  disabled
                  onNavigateToFiles={onOpenFilesTab}
                />
              ) : null}

              {editing && draft ? (
                <div className="liquor-support-item__edit">
                  <SupportItemFormFields form={draft} contracts={mappedContracts} onChange={(p) => setDraft((prev) => (prev ? { ...prev, ...p } : prev))} />
                  <div className="liquor-support-item__actions">
                    <FormButton type="button" disabled={saving} onClick={() => void handleSave()}>
                      {saving ? '저장 중…' : '저장'}
                    </FormButton>
                    <FormButton type="button" variant="secondary" onClick={() => { setEditingId(null); setDraft(null) }}>
                      취소
                    </FormButton>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      <div className="liquor-support-item__create">
        <h3 className="liquor-support-item__create-title">지원물품 추가</h3>
        <SupportItemFormFields
          form={createForm}
          contracts={mappedContracts}
          onChange={(p) => setCreateForm((prev) => ({ ...prev, ...p }))}
        />
        <div className="liquor-support-item__actions">
          <FormButton type="button" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? '등록 중…' : '지원물품 추가'}
          </FormButton>
        </div>
      </div>
    </div>
  )
}
