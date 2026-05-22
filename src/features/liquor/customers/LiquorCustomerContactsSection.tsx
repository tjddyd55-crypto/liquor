import { useMemo, useState, type ReactNode } from 'react'
import { useConfirmDialog } from '../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import {
  createLiquorCustomerContact,
  deleteLiquorCustomerContact,
  mapLiquorCustomerContact,
  updateLiquorCustomerContact,
  validateLiquorContactInput,
  type LiquorCustomerContact,
  type LiquorCustomerContactInput,
} from './liquorCustomerContactClient'
import { LIQUOR_CONTACT_ROLE_OPTIONS } from './liquorCustomerUi'

type Props = {
  customerId: number
  token: string
  contacts: Array<Record<string, unknown>>
  onChanged: () => Promise<void>
}

type FormState = LiquorCustomerContactInput

function emptyForm(): FormState {
  return {
    name: '',
    birthDate: null,
    phone: '',
    jobTitle: '',
    roleLabel: '',
    email: '',
    isSignatureRecipient: false,
    memo: '',
  }
}

function toFormState(c: LiquorCustomerContact): FormState {
  return {
    name: c.name,
    birthDate: c.birthDate,
    phone: c.phone,
    jobTitle: c.jobTitle,
    roleLabel: c.roleLabel,
    email: c.email,
    isSignatureRecipient: c.isSignatureRecipient,
    memo: c.memo,
  }
}

function contactSummaryLabel(c: LiquorCustomerContact): string {
  const parts: string[] = []
  if (c.phone.trim() && c.name.trim()) parts.push(c.phone.trim())
  else if (c.phone.trim()) parts.push(c.phone.trim())
  if (c.roleLabel.trim()) parts.push(c.roleLabel.trim())
  if (c.jobTitle.trim()) parts.push(c.jobTitle.trim())
  return parts.length ? parts.join(' · ') : '(연락처·역할 미입력)'
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return (
    <label className={'liquor-contact__field' + (wide ? ' liquor-contact__field--wide' : '')}>
      {label}
      {children}
    </label>
  )
}

function ContactFormFields({
  form,
  onChange,
}: {
  form: FormState
  onChange: (patch: Partial<FormState>) => void
}) {
  return (
    <div className="liquor-customer-form-grid">
      <Field label="이름">
        <FormInput value={form.name ?? ''} onChange={(e) => onChange({ name: e.target.value })} />
      </Field>
      <Field label="생년월일">
        <FormInput
          type="date"
          value={form.birthDate ?? ''}
          onChange={(e) => onChange({ birthDate: e.target.value || null })}
        />
      </Field>
      <Field label="연락처">
        <FormInput
          value={form.phone ?? ''}
          inputMode="tel"
          placeholder="010-1234-5678"
          onChange={(e) => onChange({ phone: e.target.value })}
        />
      </Field>
      <Field label="직책">
        <FormInput value={form.jobTitle ?? ''} onChange={(e) => onChange({ jobTitle: e.target.value })} />
      </Field>
      <Field label="역할">
        <FormSelect value={form.roleLabel ?? ''} onChange={(e) => onChange({ roleLabel: e.target.value })}>
          <option value="">선택</option>
          {LIQUOR_CONTACT_ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </FormSelect>
      </Field>
      <Field label="이메일">
        <FormInput
          type="email"
          value={form.email ?? ''}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </Field>
      <Field label="전자서명 수신자">
        <label className="liquor-contact__checkbox">
          <FormInput
            type="checkbox"
            checked={Boolean(form.isSignatureRecipient)}
            onChange={(e) => onChange({ isSignatureRecipient: e.target.checked })}
          />
          <span>전자서명 수신 대상</span>
        </label>
      </Field>
      <Field label="메모" wide>
        <FormTextarea value={form.memo ?? ''} rows={2} onChange={(e) => onChange({ memo: e.target.value })} />
      </Field>
    </div>
  )
}

export function LiquorCustomerContactsSection({ customerId, token, contacts, onChanged }: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const mapped = useMemo(() => contacts.map(mapLiquorCustomerContact), [contacts])
  const [editingId, setEditingId] = useState<number | null>(null)
  const [draft, setDraft] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const [newForm, setNewForm] = useState<FormState>(emptyForm)
  const [creating, setCreating] = useState(false)

  const openEdit = (c: LiquorCustomerContact) => {
    setEditingId(c.id)
    setDraft(toFormState(c))
    setMessage(null)
  }

  const closeEdit = () => {
    setEditingId(null)
    setDraft(null)
  }

  const handleSave = async () => {
    if (!draft || editingId == null) return
    const err = validateLiquorContactInput(draft)
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      await updateLiquorCustomerContact(token, customerId, editingId, draft)
      setMessage({ tone: 'ok', text: '담당자 정보가 저장되었습니다.' })
      await onChanged()
      closeEdit()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '저장에 실패했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c: LiquorCustomerContact) => {
    const label = c.name.trim() || c.phone.trim() || '이 담당자'
    const ok = await confirm({
      title: '담당자 삭제',
      message: `${label} 담당자를 삭제할까요? 삭제 후에는 복구할 수 없습니다.`,
      confirmLabel: '삭제',
      cancelLabel: '취소',
      tone: 'danger',
    })
    if (!ok) return
    setDeletingId(c.id)
    setMessage(null)
    try {
      await deleteLiquorCustomerContact(token, customerId, c.id)
      if (editingId === c.id) closeEdit()
      setMessage({ tone: 'ok', text: '담당자가 삭제되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '삭제에 실패했습니다.' })
    } finally {
      setDeletingId(null)
    }
  }

  const handleCreate = async () => {
    const err = validateLiquorContactInput(newForm)
    if (err) {
      setMessage({ tone: 'err', text: err })
      return
    }
    setCreating(true)
    setMessage(null)
    try {
      await createLiquorCustomerContact(token, customerId, newForm)
      setNewForm(emptyForm())
      setMessage({ tone: 'ok', text: '담당자가 추가되었습니다.' })
      await onChanged()
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : '추가에 실패했습니다.' })
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
              ? 'liquor-contact__msg liquor-contact__msg--ok'
              : 'liquor-contact__msg liquor-contact__msg--err'
          }
        >
          {message.text}
        </p>
      ) : null}

      <ul className="liquor-contact__list">
        {mapped.map((c) => {
          const editing = editingId === c.id
          return (
            <li key={c.id} className={'liquor-contact' + (editing ? ' liquor-contact--open' : '')}>
              <div className="liquor-contact__header">
                <div className="liquor-contact__summary">
                  <span className="liquor-contact__summary-title">{c.name.trim() || '(이름 없음)'}</span>
                  <span className="liquor-contact__summary-meta">{contactSummaryLabel(c)}</span>
                  {c.isSignatureRecipient ? (
                    <span className="liquor-contact__badge">전자서명 수신</span>
                  ) : null}
                </div>
                <div className="liquor-contact__toolbar">
                  <FormButton type="button" disabled={saving || deletingId != null} onClick={() => (editing ? closeEdit() : openEdit(c))}>
                    {editing ? '닫기' : '수정'}
                  </FormButton>
                  <FormButton
                    type="button"
                    disabled={saving || deletingId === c.id}
                    onClick={() => void handleDelete(c)}
                  >
                    {deletingId === c.id ? '삭제 중…' : '삭제'}
                  </FormButton>
                </div>
              </div>
              {editing && draft ? (
                <div className="liquor-contact__edit">
                  <ContactFormFields form={draft} onChange={(patch) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev))} />
                  <div className="liquor-contact__actions">
                    <FormButton type="button" disabled={saving} onClick={() => void handleSave()}>
                      {saving ? '저장 중…' : '저장'}
                    </FormButton>
                    <FormButton type="button" disabled={saving} onClick={closeEdit}>
                      취소
                    </FormButton>
                  </div>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>

      {mapped.length === 0 ? <p className="liquor-customer-panel__muted">등록된 담당자가 없습니다.</p> : null}

      <div className="liquor-contact__create">
        <h3 className="liquor-contact__create-title">담당자 추가</h3>
        <ContactFormFields form={newForm} onChange={(patch) => setNewForm((prev) => ({ ...prev, ...patch }))} />
        <div className="liquor-contact__actions">
          <FormButton type="button" disabled={creating} onClick={() => void handleCreate()}>
            {creating ? '추가 중…' : '담당자 추가'}
          </FormButton>
        </div>
      </div>
    </div>
  )
}
