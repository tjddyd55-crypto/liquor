import { useCallback, useEffect, useState } from 'react'
import { useConfirmDialog } from '../../../../components/dialog'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../../components/form'
import { ApiError } from '../../../../lib/apiClient'
import {
  createContractTemplateConfirmationField,
  deleteContractTemplateConfirmationField,
  listContractTemplateConfirmationFields,
  updateContractTemplateConfirmationField,
  type ContractTemplateConfirmationField,
  type ContractTemplateConfirmationFieldInputRole,
  type ContractTemplateConfirmationFieldInputType,
  type CreateContractTemplateConfirmationFieldInput,
  type UpdateContractTemplateConfirmationFieldInput,
} from '../contractTemplateConfirmationFieldsClient'

type Props = {
  token: string
  role: string | undefined
  tenantGaId: number | null
  templateId: string
  disabled: boolean
  onError: (msg: string | null) => void
}

const INPUT_TYPE_OPTIONS: Array<{ value: ContractTemplateConfirmationFieldInputType; label: string }> = [
  { value: 'text', label: '텍스트(한 줄)' },
  { value: 'textarea', label: '텍스트 영역' },
  { value: 'number', label: '숫자' },
  { value: 'date', label: '날짜' },
]

const INPUT_ROLE_OPTIONS: Array<{ value: ContractTemplateConfirmationFieldInputRole; label: string }> = [
  { value: 'sender', label: '발송자 입력' },
  { value: 'customer', label: '고객 입력' },
]

function normalizeInputRole(raw: unknown): ContractTemplateConfirmationFieldInputRole {
  return raw === 'customer' ? 'customer' : 'sender'
}

function inputRoleLabel(role: unknown): string {
  return normalizeInputRole(role) === 'customer' ? '고객 입력' : '발송자 입력'
}

function emptyCreateDraft(): CreateContractTemplateConfirmationFieldInput {
  return {
    label: '',
    fieldKey: undefined,
    inputType: 'text',
    inputRole: 'sender',
    required: false,
    sortOrder: undefined,
    placeholder: null,
    helpText: null,
  }
}

function toUpdateDraft(row: ContractTemplateConfirmationField): UpdateContractTemplateConfirmationFieldInput {
  return {
    label: row.label,
    inputType: row.inputType,
    inputRole: normalizeInputRole(row.inputRole),
    required: row.required,
    sortOrder: row.sortOrder,
    placeholder: row.placeholder,
    helpText: row.helpText,
  }
}

export function ContractTemplateConfirmationFieldsSection({
  token,
  role,
  tenantGaId,
  templateId,
  disabled,
  onError,
}: Props) {
  const { confirm, confirmDialog } = useConfirmDialog()
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<ContractTemplateConfirmationField[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [createDraft, setCreateDraft] = useState(emptyCreateDraft)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<UpdateContractTemplateConfirmationFieldInput | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    onError(null)
    try {
      const list = await listContractTemplateConfirmationFields(token, role, templateId, tenantGaId)
      setItems(list)
    } catch (e) {
      onError(e instanceof ApiError ? e.message : '확인 항목을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, role, templateId, tenantGaId, onError])

  useEffect(() => {
    void load()
  }, [load])

  const busy = disabled || submitting

  const startEdit = (row: ContractTemplateConfirmationField) => {
    setEditingId(row.id)
    setEditDraft(toUpdateDraft(row))
    setAddOpen(false)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditDraft(null)
  }

  return (
    <>
      {confirmDialog}
      <div className="contract-signature-console__conf-fields">
        <h4 className="contract-signature-console__subsection-title" style={{ fontSize: '1rem', marginTop: 16 }}>
          확인서 항목(무좌표)
        </h4>
        <p className="contract-signature-console__hint" style={{ margin: '0 0 10px', fontSize: 12 }}>
          고객 확인서에 표시할 입력 항목을 정의합니다. 발송·고객 화면 연동은 이후 단계에서 적용됩니다.
        </p>
        {loading ? (
          <p className="contract-signature-console__body-text">확인 항목 불러오는 중…</p>
        ) : null}
        {!loading && !addOpen && editingId == null ? (
          <div style={{ marginBottom: 12 }}>
            <FormButton
              htmlType="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCreateDraft(emptyCreateDraft())
                setAddOpen(true)
                cancelEdit()
              }}
            >
              항목 추가
            </FormButton>
          </div>
        ) : null}
        {addOpen ? (
          <div className="contract-signature-console__conf-card" style={{ marginBottom: 14 }}>
            <div className="contract-signature-console__conf-card-title">새 항목</div>
            <div className="contract-signature-console__conf-stack">
              <label className="contract-signature-console__conf-label">
                라벨(필수)
                <FormInput
                  value={createDraft.label}
                  disabled={busy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, label: e.target.value }))}
                  placeholder="예: 확인 일자"
                />
              </label>
              <label className="contract-signature-console__conf-label">
                fieldKey(선택, 비우면 자동 생성)
                <FormInput
                  value={createDraft.fieldKey ?? ''}
                  disabled={busy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, fieldKey: e.target.value.trim() || undefined }))}
                  placeholder="영문 시작, 영숫자·밑줄"
                />
              </label>
              <label className="contract-signature-console__conf-label">
                입력 유형
                <FormSelect
                  value={createDraft.inputType ?? 'text'}
                  disabled={busy}
                  options={INPUT_TYPE_OPTIONS}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === 'text' || v === 'textarea' || v === 'number' || v === 'date') {
                      setCreateDraft((d) => ({ ...d, inputType: v }))
                    }
                  }}
                />
              </label>
              <label className="contract-signature-console__conf-label">
                입력 주체
                <FormSelect
                  value={normalizeInputRole(createDraft.inputRole)}
                  disabled={busy}
                  options={INPUT_ROLE_OPTIONS}
                  onChange={(e) => {
                    setCreateDraft((d) => ({ ...d, inputRole: normalizeInputRole(e.target.value) }))
                  }}
                />
                <span className="contract-signature-console__conf-role-help">
                  {normalizeInputRole(createDraft.inputRole) === 'customer'
                    ? '고객 입력: 고객이 공개 링크에서 직접 입력합니다.'
                    : '발송자 입력: 발송자가 값을 입력하고 고객은 확인합니다.'}
                </span>
              </label>
              <label className="contract-signature-console__conf-label contract-signature-console__conf-label--checkbox">
                <FormInput
                  type="checkbox"
                  checked={Boolean(createDraft.required)}
                  disabled={busy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, required: e.target.checked }))}
                />
                필수 입력
              </label>
              <label className="contract-signature-console__conf-label">
                순서(비우면 맨 끝)
                <FormInput
                  type="number"
                  value={createDraft.sortOrder === undefined ? '' : String(createDraft.sortOrder)}
                  disabled={busy}
                  onChange={(e) => {
                    const raw = e.target.value
                    setCreateDraft((d) => ({
                      ...d,
                      sortOrder: raw === '' ? undefined : Number(raw),
                    }))
                  }}
                />
              </label>
              <label className="contract-signature-console__conf-label">
                placeholder(선택)
                <FormInput
                  value={createDraft.placeholder ?? ''}
                  disabled={busy}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, placeholder: e.target.value === '' ? null : e.target.value }))
                  }
                />
              </label>
              <label className="contract-signature-console__conf-label">
                도움말(선택)
                <FormTextarea
                  value={createDraft.helpText ?? ''}
                  disabled={busy}
                  rows={2}
                  onChange={(e) =>
                    setCreateDraft((d) => ({ ...d, helpText: e.target.value === '' ? null : e.target.value }))
                  }
                />
              </label>
            </div>
            <div className="contract-signature-console__conf-card-actions">
              <FormButton
                htmlType="button"
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setAddOpen(false)
                  setCreateDraft(emptyCreateDraft())
                }}
              >
                취소
              </FormButton>
              <FormButton
                htmlType="button"
                variant="primary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    const label = createDraft.label.trim()
                    if (!label) {
                      onError('라벨을 입력하세요.')
                      return
                    }
                    setSubmitting(true)
                    onError(null)
                    try {
                      const payload: CreateContractTemplateConfirmationFieldInput = {
                        ...createDraft,
                        label,
                        fieldKey: createDraft.fieldKey?.trim() || undefined,
                        inputRole: normalizeInputRole(createDraft.inputRole),
                      }
                      await createContractTemplateConfirmationField(token, role, templateId, payload, tenantGaId)
                      setAddOpen(false)
                      setCreateDraft(emptyCreateDraft())
                      await load()
                    } catch (e) {
                      onError(e instanceof ApiError ? e.message : '항목을 추가하지 못했습니다.')
                    } finally {
                      setSubmitting(false)
                    }
                  })()
                }
              >
                저장
              </FormButton>
            </div>
          </div>
        ) : null}

        <ul className="contract-signature-console__conf-item-list">
          {items.map((row) => (
            <li key={row.id} className="contract-signature-console__conf-item">
              {editingId === row.id && editDraft ? (
                <div className="contract-signature-console__conf-card">
                  <div className="contract-signature-console__conf-card-title">항목 수정</div>
                  <div className="contract-signature-console__conf-stack">
                    <label className="contract-signature-console__conf-label">
                      fieldKey(읽기 전용)
                      <FormInput value={row.fieldKey} readOnly disabled className="field--readonly" />
                    </label>
                    <label className="contract-signature-console__conf-label">
                      라벨(필수)
                      <FormInput
                        value={editDraft.label ?? ''}
                        disabled={busy}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, label: e.target.value } : d))}
                      />
                    </label>
                    <label className="contract-signature-console__conf-label">
                      입력 유형
                      <FormSelect
                        value={editDraft.inputType ?? 'text'}
                        disabled={busy}
                        options={INPUT_TYPE_OPTIONS}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === 'text' || v === 'textarea' || v === 'number' || v === 'date') {
                            setEditDraft((d) => (d ? { ...d, inputType: v } : d))
                          }
                        }}
                      />
                    </label>
                    <label className="contract-signature-console__conf-label">
                      입력 주체
                      <FormSelect
                        value={normalizeInputRole(editDraft.inputRole)}
                        disabled={busy}
                        options={INPUT_ROLE_OPTIONS}
                        onChange={(e) => {
                          setEditDraft((d) => (d ? { ...d, inputRole: normalizeInputRole(e.target.value) } : d))
                        }}
                      />
                      <span className="contract-signature-console__conf-role-help">
                        {normalizeInputRole(editDraft.inputRole) === 'customer'
                          ? '고객 입력: 고객이 공개 링크에서 직접 입력합니다.'
                          : '발송자 입력: 발송자가 값을 입력하고 고객은 확인합니다.'}
                      </span>
                    </label>
                    <label className="contract-signature-console__conf-label contract-signature-console__conf-label--checkbox">
                      <FormInput
                        type="checkbox"
                        checked={Boolean(editDraft.required)}
                        disabled={busy}
                        onChange={(e) => setEditDraft((d) => (d ? { ...d, required: e.target.checked } : d))}
                      />
                      필수 입력
                    </label>
                    <label className="contract-signature-console__conf-label">
                      순서
                      <FormInput
                        type="number"
                        value={editDraft.sortOrder === undefined ? '' : String(editDraft.sortOrder)}
                        disabled={busy}
                        onChange={(e) => {
                          const raw = e.target.value
                          setEditDraft((d) =>
                            d
                              ? {
                                  ...d,
                                  sortOrder: raw === '' ? undefined : Number(raw),
                                }
                              : d,
                          )
                        }}
                      />
                    </label>
                    <label className="contract-signature-console__conf-label">
                      placeholder
                      <FormInput
                        value={editDraft.placeholder ?? ''}
                        disabled={busy}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, placeholder: e.target.value === '' ? null : e.target.value } : d,
                          )
                        }
                      />
                    </label>
                    <label className="contract-signature-console__conf-label">
                      도움말
                      <FormTextarea
                        value={editDraft.helpText ?? ''}
                        disabled={busy}
                        rows={2}
                        onChange={(e) =>
                          setEditDraft((d) =>
                            d ? { ...d, helpText: e.target.value === '' ? null : e.target.value } : d,
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="contract-signature-console__conf-card-actions">
                    <FormButton htmlType="button" variant="secondary" size="sm" disabled={busy} onClick={cancelEdit}>
                      취소
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="primary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          const label = String(editDraft.label ?? '').trim()
                          if (!label) {
                            onError('라벨을 입력하세요.')
                            return
                          }
                          setSubmitting(true)
                          onError(null)
                          try {
                            const payload: UpdateContractTemplateConfirmationFieldInput = {
                              label,
                              inputType: editDraft.inputType,
                              inputRole: normalizeInputRole(editDraft.inputRole),
                              required: editDraft.required,
                              sortOrder: editDraft.sortOrder,
                              placeholder: editDraft.placeholder,
                              helpText: editDraft.helpText,
                            }
                            await updateContractTemplateConfirmationField(
                              token,
                              role,
                              templateId,
                              row.id,
                              payload,
                              tenantGaId,
                            )
                            cancelEdit()
                            await load()
                          } catch (e) {
                            onError(e instanceof ApiError ? e.message : '항목을 수정하지 못했습니다.')
                          } finally {
                            setSubmitting(false)
                          }
                        })()
                      }
                    >
                      저장
                    </FormButton>
                  </div>
                </div>
              ) : (
                <>
                  <div className="contract-signature-console__conf-item-summary">
                    <span className="contract-signature-console__conf-item-label">{row.label}</span>
                    <span className="contract-signature-console__conf-item-meta">
                      <code>{row.fieldKey}</code>
                      <span> · </span>
                      <span>{row.inputType}</span>
                      <span> · </span>
                      <span className="contract-signature-console__conf-role-chip">
                        {inputRoleLabel(row.inputRole)}
                      </span>
                      <span> · </span>
                      <span>순서 {row.sortOrder}</span>
                      <span> · </span>
                      <span>{row.required ? '필수' : '선택'}</span>
                    </span>
                  </div>
                  <div className="contract-signature-console__conf-item-actions">
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() => startEdit(row)}
                    >
                      편집
                    </FormButton>
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void (async () => {
                          const ok = await confirm({
                            message: `항목「${row.label}」을 삭제할까요?`,
                            confirmLabel: '삭제',
                            cancelLabel: '취소',
                            tone: 'danger',
                          })
                          if (!ok) {
                            return
                          }
                          setSubmitting(true)
                          onError(null)
                          try {
                            await deleteContractTemplateConfirmationField(token, role, templateId, row.id, tenantGaId)
                            await load()
                          } catch (e) {
                            onError(e instanceof ApiError ? e.message : '항목을 삭제하지 못했습니다.')
                          } finally {
                            setSubmitting(false)
                          }
                        })()
                      }
                    >
                      삭제
                    </FormButton>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        {!loading && items.length === 0 && !addOpen ? (
          <p className="contract-signature-console__hint">등록된 확인 항목이 없습니다. 「항목 추가」로 필드를 만드세요.</p>
        ) : null}
      </div>
    </>
  )
}
