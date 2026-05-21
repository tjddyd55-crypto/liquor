import type { CustomerIndustryTemplate, CustomerTemplateFormField } from '../../customer-templates/customerTemplate.types'
import { resolveCanonicalFieldKey } from '../../customer-templates'
import type { CustomerNote } from '../domain/types'
import { NOTE_MAX_LENGTH } from '../utils/insuranceInfo'
import type { IndustryTemplateFormBinder } from './customerIndustryTemplateForm.types'

import {
  AddressSearchField,
  FormButton,
  FormInput,
  FormSelect,
  FormTextarea,
  type AddressSearchValue,
} from '../../../components/form'

/** checkbox 멀티 — 콤마 구분 문자열 저장 (crm_extension) */
function selectedFromCsv(csv: string): Set<string> {
  return new Set(
    String(csv ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
}

function toCsv(vals: Iterable<string>): string {
  return [...vals].sort().join(',')
}

/** create 폼 상태에만 있는 메모 메타 */
export type IndustryCreateExtras = {
  noteDraft?: string
  notes?: CustomerNote[]
}

type Patch = Partial<
  IndustryTemplateFormBinder &
    IndustryCreateExtras & {
      noteDraft?: string
      notes?: CustomerNote[]
    }
>

/** 템플릿 순서대로 업종 폼 블록. 보험 전용 차량·운전·건강날린 등은 포함하지 않는다. */
export default function CustomerIndustryTemplateFields({
  template,
  value,
  onPatch,
  variant,
  radioSuffix,
  onStatusMessage,
  readOnlyPreview = false,
}: {
  template: CustomerIndustryTemplate
  value: IndustryTemplateFormBinder & IndustryCreateExtras
  onPatch: (patch: Patch) => void
  variant: 'create' | 'edit'
  radioSuffix: string
  onStatusMessage?: (message: string) => void
  /** 빌더 인라인 미리보기 — patch·주소검색·외부 API side effect 차단 */
  readOnlyPreview?: boolean
}) {
  const emitPatch: (patch: Patch) => void = readOnlyPreview ? () => {} : onPatch
  const inputLock = readOnlyPreview ? ({ readOnly: true, disabled: true } as const) : {}

  const fields = [...template.formFields]
    .filter((f) => f.visibleDefault !== false)
    .sort((a, b) => a.order - b.order)

  const seen = new Set<string>()
  const blocks: JSX.Element[] = []

  function pushDraftNoteFixed(draft: string) {
    if (readOnlyPreview) return
    const trimmed = draft.trim()
    if (!trimmed) return
    if (trimmed.length > NOTE_MAX_LENGTH) {
      onStatusMessage?.(`메모는 ${NOTE_MAX_LENGTH}자 이하로 입력해주세요.`)
      return
    }
    const newNote: CustomerNote = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      content: trimmed,
      createdAt: new Date().toISOString(),
    }
    emitPatch({
      notes: [...(value.notes ?? []), newNote],
      noteDraft: '',
    })
    onStatusMessage?.('')
  }

  for (let i = 0; i < fields.length; i += 1) {
    const field = fields[i]
    const canon = resolveCanonicalFieldKey(field.fieldKey)
    if (seen.has(canon)) continue
    seen.add(canon)

    if (canon === 'customer.name') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            placeholder={field.label}
            value={value.name}
            onChange={(e) => emitPatch({ name: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.phone') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            placeholder={field.label}
            value={value.phone}
            onChange={(e) => emitPatch({ phone: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.carrier') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            placeholder={field.label}
            value={value.carrier}
            onChange={(e) => emitPatch({ carrier: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.birthDate') {
      const phRaw = String(field.placeholder ?? '').trim()
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            inputMode="numeric"
            autoComplete="bday"
            placeholder={phRaw || 'YYMMDD 6자리 또는 YYYY-MM-DD'}
            value={value.birthDate}
            maxLength={10}
            onChange={(e) => {
              const v = e.target.value
              if (v.includes('-')) {
                emitPatch({ birthDate: v.replace(/[^\d-]/g, '').slice(0, 10) })
                return
              }
              emitPatch({ birthDate: v.replace(/\D/g, '').slice(0, 6) })
            }}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.ssn' || canon === 'insurance.ssn') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            placeholder={field.label}
            value={value.ssn}
            onChange={(e) => emitPatch({ ssn: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.gender') {
      blocks.push(
        <div className="field customer-form-field--gender" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <div className="customer-form-gender-options" role="radiogroup" aria-label={field.label}>
            <label>
              <FormInput
                type="radio"
                name={`gender-industry-${radioSuffix}`}
                checked={value.gender === 'male'}
                onChange={() => emitPatch({ gender: 'male' })}
                {...inputLock}
              />{' '}
              남
            </label>
            <label>
              <FormInput
                type="radio"
                name={`gender-industry-${radioSuffix}`}
                checked={value.gender === 'female'}
                onChange={() => emitPatch({ gender: 'female' })}
              />{' '}
              여
            </label>
          </div>
        </div>,
      )
      continue
    }

    if (canon === 'customer.address') {
      blocks.push(
        <div className="field field--wide" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <AddressSearchField
            className="address-search-field"
            previewStatic={readOnlyPreview}
            value={{
              zonecode: value.zonecode,
              baseAddress: value.address,
              detailAddress: value.addressDetail,
            }}
            onChange={(next: AddressSearchValue) =>
              emitPatch({
                zonecode: next.zonecode,
                address: next.baseAddress,
                addressDetail: next.detailAddress,
              })
            }
          />
        </div>,
      )
      continue
    }

    if (canon === 'customer.memo') {
      const memoVal = value.crmExtensionFields['customer.memo'] ?? ''
      blocks.push(
        <div className="field field--wide" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormTextarea
            className="field__control customer-form-textarea"
            rows={4}
            aria-label={field.label}
            value={memoVal}
            onChange={(e) =>
              emitPatch({
                crmExtensionFields: {
                  ...value.crmExtensionFields,
                  'customer.memo': e.target.value,
                },
              })
            }
            {...inputLock}
          />
          <span className="text-xs mt-1 block opacity-90" style={{ color: 'var(--text-sub)' }}>
            「customer.memo」 값은 crm_extension(확장 JSON)의 fields 맵에 저장됩니다.
          </span>
        </div>,
      )
      continue
    }

    if (canon === 'customer.job') {
      blocks.push(
        <label className="field field--wide" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            placeholder={field.label}
            value={value.job}
            onChange={(e) => emitPatch({ job: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.height') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            value={value.height}
            onChange={(e) => emitPatch({ height: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    if (canon === 'customer.weight') {
      blocks.push(
        <label className="field" key={`${canon}-${i}`}>
          <span className="field__label">{field.label}</span>
          <FormInput
            className="field__control"
            value={value.weight}
            onChange={(e) => emitPatch({ weight: e.target.value })}
            {...inputLock}
          />
        </label>,
      )
      continue
    }

    const fdef = field as CustomerTemplateFormField

    blocks.push(
      <label className={`field ${fdef.widget === 'textarea' ? 'field--wide' : ''}`} key={`${canon}-${i}`}>
        <span className="field__label">{field.label}</span>
        {(() => {
          const rawVal = value.crmExtensionFields[canon] ?? ''
          const opts = [...(fdef.options ?? [])]
          const selectItems = [{ value: '', label: '(선택)' }, ...opts.map((o) => ({ value: o.value, label: o.label }))]

          const patchExt = (next: string) =>
            emitPatch({
              crmExtensionFields: {
                ...value.crmExtensionFields,
                [canon]: next,
              },
            })

          if (fdef.widget === 'select' && opts.length > 0) {
            return (
              <FormSelect
                className="field__control"
                value={rawVal}
                options={selectItems}
                onChange={(e) => patchExt(e.target.value)}
                {...inputLock}
              />
            )
          }

          if (fdef.widget === 'radio' && opts.length > 0) {
            return (
              <div className="customer-form-gender-options" role="radiogroup" aria-label={field.label}>
                {opts.map((o) => (
                  <label key={o.value}>
                    <FormInput
                      type="radio"
                      name={`industry-radio-${radioSuffix}-${canon}`}
                      checked={rawVal === o.value}
                      onChange={() => patchExt(o.value)}
                      {...inputLock}
                    />{' '}
                    {o.label}
                  </label>
                ))}
              </div>
            )
          }

          if (fdef.widget === 'checkbox' && opts.length > 0) {
            const sel = selectedFromCsv(rawVal)
            return (
              <div className="flex flex-col gap-2">
                {opts.map((o) => {
                  const on = sel.has(o.value)
                  return (
                    <label key={o.value} className="flex gap-2 items-center">
                      <FormInput
                        type="checkbox"
                        checked={on}
                        onChange={() => {
                          const next = new Set(sel)
                          if (on) {
                            next.delete(o.value)
                          } else {
                            next.add(o.value)
                          }
                          patchExt(toCsv(next))
                        }}
                        {...inputLock}
                      />
                      <span>{o.label}</span>
                    </label>
                  )
                })}
              </div>
            )
          }

          if (fdef.widget === 'textarea') {
            return (
              <FormTextarea
                className="field__control customer-form-textarea"
                rows={4}
                placeholder={fdef.placeholder || field.label}
                value={rawVal}
                onChange={(e) => patchExt(e.target.value)}
                {...inputLock}
              />
            )
          }

          if (fdef.widget === 'date') {
            return (
              <FormInput
                className="field__control"
                type="date"
                value={String(rawVal).slice(0, 10)}
                onChange={(e) => patchExt(e.target.value.slice(0, 10))}
                {...inputLock}
              />
            )
          }

          if (fdef.widget === 'number') {
            return (
              <FormInput
                className="field__control"
                type="text"
                inputMode="numeric"
                placeholder={fdef.placeholder || field.label}
                value={rawVal}
                onChange={(e) => patchExt(e.target.value)}
                {...inputLock}
              />
            )
          }

          return (
            <FormInput
              className="field__control"
              placeholder={fdef.placeholder || field.label}
              value={rawVal}
              onChange={(e) => patchExt(e.target.value)}
              {...inputLock}
            />
          )
        })()}
      </label>,
    )
  }

  /** create 전용 노트 리스트(UI 전용 노트 블록) */
  const notesExtra =
    !readOnlyPreview && variant === 'create' && value.noteDraft !== undefined ? (
      <div className="field field--wide">
        <span className="field__label">메모 (최대 {NOTE_MAX_LENGTH}자)</span>
        <div className="flex flex-wrap gap-2 items-center mt-1">
          <FormInput
            className="field__control"
            style={{ flex: '1 1 220px' }}
            placeholder="메모 입력"
            value={value.noteDraft ?? ''}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(e) => emitPatch({ noteDraft: e.target.value.slice(0, NOTE_MAX_LENGTH) })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                pushDraftNoteFixed(String(value.noteDraft ?? ''))
              }
            }}
          />
          <FormButton
            className="filter-button"
            htmlType="button"
            variant="action"
            style={{ fontSize: '0.875rem', padding: '4px 10px' }}
            onClick={() => pushDraftNoteFixed(String(value.noteDraft ?? ''))}
          >
            추가
          </FormButton>
        </div>
        {Array.isArray(value.notes) && value.notes.length > 0 ? (
          <ul className="list-none p-0 mt-2">
            {value.notes.map((note) => (
              <li
                key={note.id}
                className="border-t border-solid pt-2"
                style={{ borderColor: 'rgba(248,250,252,0.08)' }}
              >
                {note.content}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    ) : null

  return (
    <div className="field-grid-customers customer-industry-template-fields">
      <p className="field field--wide text-sm mb-2" style={{ color: '#94a3b8' }}>
        업종 템플릿 레이아웃 (<strong style={{ color: '#e5e7eb' }}>{template.meta.industryCode}</strong>). 보험
        전용(차량·운전·건강·가입내역) 블록은 숨김 처리되었습니다.
      </p>
      <div className="customer-form-compact-grid field--wide">{blocks}</div>
      {notesExtra}
    </div>
  )
}
