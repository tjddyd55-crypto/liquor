import { CUSTOMER_PDF_FIELD_OPTIONS } from '../config/customerPdfFieldOptions'
import { normalizePdfFieldDataMapping } from '../lib/resolvePdfFieldValue'
import type { PdfFieldDataMapping, PdfFieldDataSourceType } from '../types'

type Props = {
  mapping: PdfFieldDataMapping
  compact?: boolean
  onChange: (next: PdfFieldDataMapping) => void
}

export function formatPdfFieldMappingSummary(mapping: PdfFieldDataMapping): string {
  const m = normalizePdfFieldDataMapping(mapping)
  if (m.dataSourceType === 'customer' && m.customerFieldKey) {
    const label =
      m.customerFieldLabel ||
      CUSTOMER_PDF_FIELD_OPTIONS.find((o) => o.key === m.customerFieldKey)?.label ||
      m.customerFieldKey
    return `고객 데이터 · ${label}`
  }
  return '직접 입력'
}

export function PdfFieldDataMappingControls({ mapping, compact = false, onChange }: Props) {
  const m = normalizePdfFieldDataMapping(mapping)

  const setSource = (dataSourceType: PdfFieldDataSourceType) => {
    if (dataSourceType === 'manual') {
      onChange({
        ...m,
        dataSourceType: 'manual',
        customerFieldKey: null,
        customerFieldLabel: null,
      })
      return
    }
    const first = CUSTOMER_PDF_FIELD_OPTIONS[0]
    onChange({
      ...m,
      dataSourceType: 'customer',
      customerFieldKey: m.customerFieldKey ?? first?.key ?? null,
      customerFieldLabel:
        m.customerFieldLabel ?? (first ? first.label : null),
    })
  }

  const setCustomerKey = (customerFieldKey: string) => {
    const opt = CUSTOMER_PDF_FIELD_OPTIONS.find((o) => o.key === customerFieldKey)
    onChange({
      ...m,
      dataSourceType: 'customer',
      customerFieldKey: opt?.key ?? null,
      customerFieldLabel: opt?.label ?? null,
    })
  }

  return (
    <div className={compact ? 'pdf-engine-mapping-controls pdf-engine-mapping-controls--compact' : 'pdf-engine-mapping-controls'}>
      <label className="pdf-engine-editor__label pdf-engine-mapping-controls__source">
        {compact ? null : <span className="pdf-engine-mapping-controls__label-text">입력 방식</span>}
        <select
          value={m.dataSourceType}
          onChange={(e) => setSource(e.target.value === 'customer' ? 'customer' : 'manual')}
          onClick={(e) => e.stopPropagation()}
        >
          <option value="manual">직접 입력</option>
          <option value="customer">고객 데이터</option>
        </select>
      </label>
      {m.dataSourceType === 'customer' ? (
        <label className="pdf-engine-editor__label pdf-engine-mapping-controls__customer-key">
          {compact ? null : <span className="pdf-engine-mapping-controls__label-text">고객 데이터</span>}
          <select
            value={m.customerFieldKey ?? ''}
            onChange={(e) => setCustomerKey(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          >
            <option value="">— 선택 —</option>
            {CUSTOMER_PDF_FIELD_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </div>
  )
}
