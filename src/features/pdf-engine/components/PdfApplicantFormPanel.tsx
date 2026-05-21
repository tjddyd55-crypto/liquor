/**
 * 사용자 신청서 입력 패널 (실시간 PDF 영역 기반 문자 제한 · 글자 크기 조절).
 * View 레이어만 — 상태는 페이지 컨테이너가 소유한다.
 */

import { useMemo, useRef, useState } from 'react'
import type { ChangeEvent, CompositionEvent, Dispatch, FormEvent, ClipboardEvent, SetStateAction } from 'react'
import { FormButton, FormInput, FormSelect, FormTextarea } from '../../../components/form'
import { PDF_APPLICANT_DEFAULT_FONT_PT, PDF_APPLICANT_FONT_MAX_PT, PDF_APPLICANT_FONT_MIN_PT } from '../lib/pdfApplicantConstants'
import {
  clampApplicantFontSizePt,
  effectiveApplicantFontSizePt,
  applicantTextLineStats,
  truncateApplicantTextToFit,
} from '../lib/pdfApplicantTypography'
import type { PdfFieldSpec } from '../types'

function parseCheckboxJsonArray(raw: string): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

export interface PdfApplicantFormPanelProps {
  title: string
  description?: string | null
  fields: PdfFieldSpec[]
  values: Record<string, string>
  fontOverrides: Record<string, number>
  submitting: boolean
  focusedFieldKey: string | null
  submitLabel?: string
  workspaceCustomerId?: number | null
  workspaceCustomerLabel?: string | null
  selectedCustomer?: PdfSelectedCustomerSummary | null
  effectiveCustomerId?: number | null
  loadCustomerButtonLabel?: string
  customerLoadHint?: string | null
  loadingCustomerData?: boolean
  overwriteCustomerOnLoad?: boolean
  onToggleOverwriteCustomerOnLoad?: () => void
  onLoadCustomerData?: () => void
  showCustomerSearch?: boolean
  onShowCustomerSearch?: () => void
  onHideCustomerSearch?: () => void
  customerSearchQuery?: string
  onCustomerSearchQueryChange?: (query: string) => void
  customerSearchBusy?: boolean
  customerSearchError?: string | null
  customerSearchResults?: PdfSelectedCustomerSummary[]
  onCustomerSearchSubmit?: () => void
  onSelectSearchedCustomer?: (customer: PdfSelectedCustomerSummary) => void
  onClearSelectedCustomer?: () => void
  onChangeValues: Dispatch<SetStateAction<Record<string, string>>>
  onChangeFontOverrides: Dispatch<SetStateAction<Record<string, number>>>
  onFocusedFieldChange: (key: string | null) => void
  onSubmit: (values: Record<string, string>, fontOverrides: Record<string, number>) => Promise<void> | void
  pdfCarPicker?: PdfApplicantCarPickerUi | null
}

function customerFields(fields: PdfFieldSpec[]): PdfFieldSpec[] {
  return [...fields].filter((f) => f.inputRole === 'customer').sort((a, b) => a.orderIndex - b.orderIndex)
}

function baselineFontPt(field: PdfFieldSpec): number {
  const p0 = field.placements[0]
  if (p0?.fontSize != null && p0.fontSize > 0) return clampApplicantFontSizePt(p0.fontSize)
  return PDF_APPLICANT_DEFAULT_FONT_PT
}

function sanitizeOverridesForPersist(
  fields: PdfFieldSpec[],
  overrides: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {}
  const textFields = fields.filter((f) => f.fieldType === 'text' || f.fieldType === 'textarea')
  for (const f of textFields) {
    const raw = overrides[f.fieldKey]
    if (typeof raw !== 'number' || !Number.isFinite(raw)) continue
    const base = baselineFontPt(f)
    const r = clampApplicantFontSizePt(raw)
    if (Math.abs(r - base) > 1e-5) out[f.fieldKey] = r
  }
  return out
}

export function buildPdfApplicantRenderPayload(values: Record<string, string>): Record<string, string> {
  const { _pdf_fs: _, ...clean } = values
  void _
  return clean
}

export function PdfApplicantFormPanel(props: PdfApplicantFormPanelProps) {
  const {
    title,
    description,
    fields,
    values,
    fontOverrides,
    submitting,
    focusedFieldKey,
    submitLabel = '결과보기',
    workspaceCustomerId = null,
    workspaceCustomerLabel = null,
    selectedCustomer = null,
    effectiveCustomerId = null,
    loadCustomerButtonLabel = '고객 데이터 불러오기',
    customerLoadHint = null,
    loadingCustomerData = false,
    overwriteCustomerOnLoad = false,
    onToggleOverwriteCustomerOnLoad,
    onLoadCustomerData,
    showCustomerSearch = false,
    onShowCustomerSearch,
    onHideCustomerSearch,
    customerSearchQuery = '',
    onCustomerSearchQueryChange,
    customerSearchBusy = false,
    customerSearchError = null,
    customerSearchResults = [],
    onCustomerSearchSubmit,
    onSelectSearchedCustomer,
    onClearSelectedCustomer,
    onChangeValues,
    onChangeFontOverrides,
    onFocusedFieldChange,
    onSubmit,
    pdfCarPicker = null,
  } = props

  const sorted = useMemo(() => customerFields(fields), [fields])
  const composingKeyRef = useRef<string | null>(null)

  const bumpFontSize = (field: PdfFieldSpec, delta: number) => {
    const cur = effectiveApplicantFontSizePt(field, fontOverrides)
    const nextRaw = clampApplicantFontSizePt(cur + delta)

    onChangeValues((prev) => {
      if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return prev
      const raw = prev[field.fieldKey] ?? ''
      const shrunk = truncateApplicantTextToFit(field, nextRaw, raw)
      if (shrunk === raw) return prev
      return { ...prev, [field.fieldKey]: shrunk }
    })

    onChangeFontOverrides((foPrev) => {
      const nextOverrides = { ...foPrev }
      const base = baselineFontPt(field)
      if (Math.abs(nextRaw - base) <= 1e-5) delete nextOverrides[field.fieldKey]
      else nextOverrides[field.fieldKey] = nextRaw
      return nextOverrides
    })
  }

  const bindTextControlled = (
    field: PdfFieldSpec,
  ): {
    value: string
    onCompositionStart: () => void
    onCompositionEnd: (e: CompositionEvent<HTMLElement>) => void
    onPaste: (e: ClipboardEvent<HTMLElement>) => void
    onChange: (next: string) => void
  } => ({
    value: values[field.fieldKey] ?? '',
    onCompositionStart: () => {
      composingKeyRef.current = field.fieldKey
    },
    onCompositionEnd: (e: CompositionEvent<HTMLElement>) => {
      composingKeyRef.current = null
      const fs = effectiveApplicantFontSizePt(field, fontOverrides)
      const merged = truncateApplicantTextToFit(field, fs, e.currentTarget.value)
      onChangeValues((prev) => ({ ...prev, [field.fieldKey]: merged }))
    },
    onPaste: (e: ClipboardEvent<HTMLElement>) => {
      if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return
      const paste = e.clipboardData?.getData('text') ?? ''
      if (!paste) return
      e.preventDefault()
      const fs = effectiveApplicantFontSizePt(field, fontOverrides)
      onChangeValues((prev) => {
        const base = `${prev[field.fieldKey] ?? ''}`
        let selStart = base.length
        let selEnd = base.length
        if ('selectionStart' in e.currentTarget && typeof e.currentTarget.selectionStart === 'number')
          selStart = e.currentTarget.selectionStart ?? 0
        if ('selectionEnd' in e.currentTarget && typeof e.currentTarget.selectionEnd === 'number')
          selEnd = e.currentTarget.selectionEnd ?? selStart
        const target = `${base.slice(0, selStart)}${paste}${base.slice(selEnd)}`
        const fit = truncateApplicantTextToFit(field, fs, target)
        return { ...prev, [field.fieldKey]: fit }
      })
    },
    onChange: (next: string) => {
      if (composingKeyRef.current === field.fieldKey) {
        onChangeValues((prev) => ({ ...prev, [field.fieldKey]: next }))
        return
      }
      const fs = effectiveApplicantFontSizePt(field, fontOverrides)
      onChangeValues((prev) => {
        const fit = truncateApplicantTextToFit(field, fs, next)
        if (fit === (prev[field.fieldKey] ?? '')) return prev
        return { ...prev, [field.fieldKey]: fit }
      })
    },
  })

  const [submitHint, setSubmitHint] = useState<string | null>(null)

  const handleSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault()
    setSubmitHint(null)
    for (const f of sorted) {
      if (!f.required) continue
      if (f.fieldType === 'signature') continue
      if (f.fieldType === 'checkbox') {
        if (!parseCheckboxJsonArray(values[f.fieldKey] ?? '').length) {
          setSubmitHint(`"${f.label}" 항목은 필수입니다.`)
          return
        }
      } else if (!(values[f.fieldKey] ?? '').trim()) {
        setSubmitHint(`"${f.label}" 항목은 필수입니다.`)
        return
      }
    }
    try {
      await onSubmit(buildPdfApplicantRenderPayload(values), sanitizeOverridesForPersist(sorted, fontOverrides))
    } catch (e) {
      setSubmitHint(e instanceof Error ? e.message : '발급에 실패했습니다.')
    }
  }

  const renderFieldInput = (field: PdfFieldSpec) => {
    const inputId = `pdf-applicant-${field.fieldKey}`
    switch (field.fieldType) {
      case 'textarea': {
        const b = bindTextControlled(field)
        return (
          <div onFocusCapture={() => onFocusedFieldChange(field.fieldKey)}>
            <FormTextarea
              id={inputId}
              name={field.fieldKey}
              required={field.required}
              value={b.value}
              onCompositionStart={b.onCompositionStart}
              onCompositionEnd={b.onCompositionEnd}
              onPaste={b.onPaste}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => b.onChange(e.target.value)}
              className="pdf-engine-form__textarea"
              rows={4}
            />
          </div>
        )
      }
      case 'checkbox': {
        const options = field.options ?? []
        const selectedSet = new Set(parseCheckboxJsonArray(values[field.fieldKey] ?? ''))
        const toggle = (opt: string, checked: boolean) => {
          onChangeValues((prev) => {
            const selectedSet = new Set(parseCheckboxJsonArray(prev[field.fieldKey] ?? ''))
            if (checked) selectedSet.add(opt)
            else selectedSet.delete(opt)
            return { ...prev, [field.fieldKey]: JSON.stringify(Array.from(selectedSet)) }
          })
        }
        if (!options.length) return <p className="pdf-applicant-inline-hint">체크 옵션이 설정되지 않았습니다.</p>
        return (
          <div
            role="group"
            aria-labelledby={`${inputId}-label`}
            className="pdf-engine-form__radio-group"
            onFocusCapture={() => onFocusedFieldChange(field.fieldKey)}
          >
            {options.map((opt, idx) => {
              const id = `${inputId}-chk-${idx}`
              return (
                <label key={id} htmlFor={id} className="pdf-engine-form__radio-item">
                  <FormInput
                    id={id}
                    type="checkbox"
                    name={`${field.fieldKey}-${idx}`}
                    checked={selectedSet.has(opt)}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => toggle(opt, e.target.checked)}
                  />
                  <span>{opt}</span>
                </label>
              )
            })}
          </div>
        )
      }
      case 'radio': {
        const opts = field.options ?? []
        if (!opts.length) return <p className="pdf-applicant-inline-hint">라디오 옵션 미설정</p>
        return (
          <div
            role="radiogroup"
            aria-labelledby={`${inputId}-label`}
            className="pdf-engine-form__radio-group"
            onFocusCapture={() => onFocusedFieldChange(field.fieldKey)}
          >
            {opts.map((opt, idx) => {
              const id = `${inputId}-r-${idx}`
              return (
                <label key={id} htmlFor={id} className="pdf-engine-form__radio-item">
                  <FormInput
                    id={id}
                    type="radio"
                    name={field.fieldKey}
                    value={opt}
                    checked={(values[field.fieldKey] ?? '') === opt}
                    onChange={() => {
                      onChangeValues((prev) => ({ ...prev, [field.fieldKey]: opt }))
                      onFocusedFieldChange(field.fieldKey)
                    }}
                  />
                  <span>{opt}</span>
                </label>
              )
            })}
          </div>
        )
      }
      case 'signature':
        return (
          <div onFocusCapture={() => onFocusedFieldChange(field.fieldKey)}>
            <p id={inputId}>서명 필드는 이 화면에서 입력하지 않습니다.</p>
          </div>
        )
      case 'text':
      default: {
        const b = bindTextControlled(field)
        return (
          <div onFocusCapture={() => onFocusedFieldChange(field.fieldKey)}>
          <FormInput
            id={inputId}
            name={field.fieldKey}
            required={field.required}
            value={b.value}
            onCompositionStart={b.onCompositionStart}
            onCompositionEnd={b.onCompositionEnd}
            onPaste={b.onPaste}
            onChange={(e: ChangeEvent<HTMLInputElement>) => b.onChange(e.target.value)}
            type="text"
            className="pdf-engine-form__input"
          />
          </div>
        )
      }
    }
  }

  const renderFooterLine = (field: PdfFieldSpec) => {
    if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return null
    const stats = applicantTextLineStats(
      field,
      effectiveApplicantFontSizePt(field, fontOverrides),
      values[field.fieldKey] ?? '',
    )
    if (!stats) return null
    const lm = stats.linesMax
    const linePhrase =
      lm != null
        ? `현재 ${stats.linesUsed}줄 / 최대 ${lm}줄`
        : stats.linesUsed
          ? `현재 ${stats.linesUsed}줄`
          : '내용 없음'

    const cap = !stats.canGrow && (values[field.fieldKey] ?? '').trim().length > 0

    return (
      <p className="pdf-applicant-field-foot">
        <span>{linePhrase}</span>
        {cap ? (
          <span className="pdf-applicant-field-foot--muted">
            {' '}
            — PDF 입력 영역이 가득 찼습니다. 글자 크기를 줄이면 더 입력할 수 있습니다.
          </span>
        ) : null}
      </p>
    )
  }

  const fontStepperFor = (field: PdfFieldSpec) => {
    if (field.fieldType !== 'text' && field.fieldType !== 'textarea') return null
    const pts = clampApplicantFontSizePt(effectiveApplicantFontSizePt(field, fontOverrides))
    return (
      <div className="pdf-applicant-font-stepper" aria-label={`${field.label} 글자 크기 조절`}>
        <span className="pdf-applicant-font-stepper__value">{pts}pt</span>
        <button
          type="button"
          className="pdf-applicant-font-stepper__btn"
          disabled={pts <= PDF_APPLICANT_FONT_MIN_PT}
          onClick={() => bumpFontSize(field, -1)}
        >
          −
        </button>
        <button type="button" className="pdf-applicant-font-stepper__btn" disabled={pts >= PDF_APPLICANT_FONT_MAX_PT} onClick={() => bumpFontSize(field, +1)}>
          +
        </button>
      </div>
    )
  }

  return (
    <form className="pdf-engine-form pdf-applicant-form-panel" onSubmit={handleSubmit} noValidate>
      <header className="pdf-engine-form__header">
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>

      <div className="pdf-applicant-form__customer-load">
        {selectedCustomer ? (
          <p className="pdf-applicant-form__customer-context">
            선택 고객: <strong>{selectedCustomer.name}</strong>
            {onClearSelectedCustomer ? (
              <button
                type="button"
                className="pdf-applicant-form__customer-link"
                onClick={onClearSelectedCustomer}
                disabled={submitting || loadingCustomerData}
              >
                선택 해제
              </button>
            ) : null}
          </p>
        ) : workspaceCustomerId != null && workspaceCustomerLabel ? (
          <p className="pdf-applicant-form__customer-context">
            현재 고객: <strong>{workspaceCustomerLabel}</strong>
          </p>
        ) : workspaceCustomerId == null && !selectedCustomer ? (
          <p className="pdf-applicant-form__customer-context pdf-applicant-form__customer-context--muted">
            고객이 선택되지 않았습니다. 고객을 검색해서 데이터를 불러올 수 있습니다.
          </p>
        ) : null}

        <FormButton
          htmlType="button"
          variant="secondary"
          className="pdf-applicant-form__load-customer-btn"
          disabled={submitting || loadingCustomerData}
          onClick={() => onLoadCustomerData?.()}
        >
          {loadingCustomerData ? '불러오는 중…' : loadCustomerButtonLabel}
        </FormButton>

        {workspaceCustomerId != null && onShowCustomerSearch && !showCustomerSearch ? (
          <button
            type="button"
            className="pdf-applicant-form__customer-link"
            onClick={onShowCustomerSearch}
            disabled={submitting || loadingCustomerData}
          >
            다른 고객 검색해서 불러오기
          </button>
        ) : null}

        {showCustomerSearch ? (
          <div className="pdf-applicant-form__customer-search">
            <div className="pdf-applicant-form__customer-search-row" role="search">
              <FormInput
                type="search"
                className="pdf-applicant-form__customer-search-input"
                placeholder="이름 또는 전화번호"
                value={customerSearchQuery}
                onChange={(e) => onCustomerSearchQueryChange?.(e.target.value)}
                disabled={submitting || customerSearchBusy}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onCustomerSearchSubmit?.()
                  }
                }}
              />
              <FormButton
                htmlType="button"
                variant="secondary"
                disabled={submitting || customerSearchBusy || !customerSearchQuery.trim()}
                onClick={() => onCustomerSearchSubmit?.()}
              >
                {customerSearchBusy ? '검색 중…' : '검색'}
              </FormButton>
            </div>
            {onHideCustomerSearch ? (
              <button
                type="button"
                className="pdf-applicant-form__customer-link"
                onClick={onHideCustomerSearch}
                disabled={submitting || customerSearchBusy}
              >
                검색 닫기
              </button>
            ) : null}
            {customerSearchError ? (
              <p className="pdf-applicant-form__customer-search-error" role="alert">
                {customerSearchError}
              </p>
            ) : null}
            {customerSearchResults.length > 0 ? (
              <ul className="pdf-applicant-form__customer-search-list">
                {customerSearchResults.map((row) => (
                  <li key={row.id}>
                    <span className="pdf-applicant-form__customer-search-name">{row.name}</span>
                    {row.phone ? (
                      <span className="pdf-applicant-form__customer-search-phone">{row.phone}</span>
                    ) : null}
                    <FormButton
                      htmlType="button"
                      variant="secondary"
                      className="pdf-applicant-form__customer-search-pick"
                      disabled={submitting || loadingCustomerData}
                      onClick={() => onSelectSearchedCustomer?.(row)}
                    >
                      선택
                    </FormButton>
                  </li>
                ))}
              </ul>
            ) : customerSearchBusy ? null : customerSearchQuery.trim() ? (
              <p className="pdf-applicant-form__customer-search-empty">검색 결과가 없습니다.</p>
            ) : null}
          </div>
        ) : null}

        {onToggleOverwriteCustomerOnLoad ? (
          <label className="pdf-applicant-form__overwrite">
            <input
              type="checkbox"
              checked={overwriteCustomerOnLoad}
              onChange={() => onToggleOverwriteCustomerOnLoad()}
              disabled={submitting || loadingCustomerData}
            />
            기존 입력값 덮어쓰기
          </label>
        ) : null}
        <p className="pdf-applicant-form__customer-load-hint">
          {customerLoadHint ?? '매핑된 항목의 고객 정보가 입력값에 반영됩니다.'}
        </p>

        {pdfCarPicker ? (
          <div className="pdf-applicant-form__car-picker" aria-label="PDF 고객 데이터용 차량 선택">
            <div className="pdf-applicant-form__car-picker-label">적용 차량</div>
            {pdfCarPicker.cars.length === 0 ? (
              <p className="pdf-applicant-form__car-picker-empty" role="status">
                등록된 차량이 없습니다. 차량 정보가 매핑된 필드는 비워 둡니다.
              </p>
            ) : pdfCarPicker.cars.length === 1 ? (
              <p className="pdf-applicant-form__car-picker-single" role="status">
                <strong>
                  {pdfCarPicker.cars[0].carNumber?.trim() ||
                    pdfCarPicker.cars[0].carModel?.trim() ||
                    '1번 차량'}
                </strong>
                {pdfCarPicker.cars[0].carModel?.trim() && pdfCarPicker.cars[0].carNumber?.trim() ? (
                  <span className="pdf-applicant-form__car-picker-sub"> · {pdfCarPicker.cars[0].carModel.trim()}</span>
                ) : null}
              </p>
            ) : (
              <FormSelect
                className="pdf-applicant-form__car-picker-select"
                aria-label="적용할 차량 선택"
                value={pdfCarPicker.selectedCarId != null ? String(pdfCarPicker.selectedCarId) : ''}
                disabled={submitting || loadingCustomerData}
                options={pdfCarPicker.cars.map((c, idx) => {
                  const num = `${idx + 1}번`
                  const tail = c.carNumber?.trim() || c.carModel?.trim() || '번호 미등록'
                  return { value: String(c.id), label: `${num} · ${tail}` }
                })}
                onChange={(e) => {
                  const raw = e.target.value
                  const next = raw ? Number(raw) : null
                  pdfCarPicker.onSelectCarId(
                    next != null && Number.isInteger(next) && next > 0 ? next : null,
                  )
                }}
              />
            )}
          </div>
        ) : null}
      </div>

      {submitHint ? (
        <div className="pdf-engine-page__error" role="status">
          {submitHint}
        </div>
      ) : null}

      {!sorted.length ? <p className="pdf-engine-page__hint">입력 항목이 없습니다.</p> : null}

      {sorted.map((field) => {
        const fid = field.fieldKey
        const active = focusedFieldKey === fid
        return (
          <div
            key={fid}
            className={
              'pdf-engine-form__field pdf-applicant-form-panel__field' +
              (active ? ' pdf-applicant-form-panel__field--active' : '')
            }
          >
            <label
              id={`pdf-applicant-${fid}-label`}
              htmlFor={`pdf-applicant-${fid}`}
              className={'pdf-engine-form__label' + (field.required ? ' pdf-engine-form__label-required' : '')}
            >
              {field.label}
            </label>
            <div className="pdf-applicant-form-panel__controls">
              {renderFieldInput(field)}
              <div className="pdf-applicant-form-panel__side-tools">{fontStepperFor(field)}</div>
            </div>
            {renderFooterLine(field)}
          </div>
        )
      })}
      <div className="pdf-engine-form__actions">
        <FormButton htmlType="submit" variant="primary" className="pdf-engine-form__primary" disabled={submitting || !sorted.length}>
          {submitting ? '생성 중…' : submitLabel}
        </FormButton>
      </div>
    </form>
  )
}
