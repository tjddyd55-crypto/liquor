import type { CrmDraftListColumn, CrmTemplateDraft } from '../crmTemplateBuilder.types'
import { draftToPreviewIndustryTemplate } from '../crmTemplateBuilder.converters'
import { buildStaticPreviewMockCustomer, sampleListCellValue } from './crmTemplatePreviewSampleValues'
import { formatIndustryCustomerListSecondaryLine, industryListColumnValue } from '../../../../../customers/utils/industryCustomerListSummary'

type Props = {
  draft: CrmTemplateDraft
  industryCode?: string
}

function sortedVisibleColumns(draft: CrmTemplateDraft) {
  return draft.listColumns.filter((c) => c.visibleDefault !== false)
}

function resolveCardTitle(
  columns: ReturnType<typeof sortedVisibleColumns>,
  mockName: string,
  formFields: CrmTemplateDraft['formFields'],
): string {
  const nameKey = 'customer.name'
  const nameCol = columns.find((c) => c.sourceFieldKey.trim() === nameKey)
  if (nameCol) {
    const fromCol = sampleListCellValue(nameCol, formFields)
    if (fromCol.trim()) return fromCol.trim()
  }
  if (mockName.trim()) return mockName.trim()
  const first = columns[0]
  return first ? sampleListCellValue(first, formFields) : '홍길동'
}

function resolveRowValue(
  column: CrmDraftListColumn,
  draft: CrmTemplateDraft,
  useTemplateValues: boolean,
  mockCustomer: ReturnType<typeof buildStaticPreviewMockCustomer>,
): string {
  const sfk = column.sourceFieldKey.trim()
  if (useTemplateValues && sfk) {
    const raw = industryListColumnValue(mockCustomer, sfk)
    if (raw?.trim()) return raw.trim()
  }
  return sampleListCellValue(column, draft.formFields)
}

/** 고객관리 목록 카드형 미리보기 — 샘플 데이터만 표시 */
export default function CrmTemplateListPreview({ draft, industryCode = '' }: Props) {
  const columns = sortedVisibleColumns(draft)
  if (columns.length === 0) {
    return (
      <p className="platform-admin-page__muted text-sm">
        목록 표시 항목을 추가하면 카드형 미리보기가 표시됩니다.
      </p>
    )
  }

  const ic = industryCode.trim().toLowerCase()
  const template = ic ? draftToPreviewIndustryTemplate(draft, ic) : null
  const mockCustomer = buildStaticPreviewMockCustomer(template, draft)
  const useTemplateValues = template != null

  const titleKey = 'customer.name'
  const title = resolveCardTitle(columns, mockCustomer.name, draft.formFields)
  const bodyColumns = columns.filter((c) => c.sourceFieldKey.trim() !== titleKey)

  const rows = bodyColumns.map((col) => ({
    localId: col.localId,
    label: col.label.trim() || '항목',
    value: resolveRowValue(col, draft, useTemplateValues, mockCustomer),
  }))

  const compactLine =
    template != null ? formatIndustryCustomerListSecondaryLine(mockCustomer, template) : null

  return (
    <div className="crm-template-builder__preview-list-wrap">
      <p className="platform-admin-page__field-hint text-xs m-0 mb-3">
        고객관리 목록 화면에 표시되는 카드 예시입니다. 카드를 누르면 상세 탭으로 이동합니다.
      </p>

      <article
        className="crm-template-builder__preview-list-customer-card"
        aria-label="목록 카드 미리보기"
      >
        <h4 className="crm-template-builder__preview-list-customer-card-title">{title}</h4>
        {rows.length > 0 ? (
          <dl className="crm-template-builder__preview-list-customer-card-rows">
            {rows.map((row) => (
              <div key={row.localId} className="crm-template-builder__preview-list-customer-card-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="platform-admin-page__muted text-sm m-0 mt-2">
            표시 항목이 이름만 있을 때는 카드 제목에만 보입니다.
          </p>
        )}
      </article>

      {compactLine ? (
        <p className="crm-template-builder__preview-list-compact-line platform-admin-page__muted text-xs m-0 mt-3">
          <span className="crm-template-builder__preview-list-compact-line-label">한 줄 요약 예시</span>
          {compactLine}
        </p>
      ) : null}

      <details className="crm-template-builder__preview-list-table-fallback">
        <summary>표 형식으로 보기 (참고)</summary>
        <p className="platform-admin-page__field-hint text-xs mt-2 mb-2">
          실제 고객관리 목록은 카드 형태입니다. 아래 표는 항목 구성을 빠르게 훑어볼 때만 참고하세요.
        </p>
        <div className="crm-template-builder__preview-list-table-scroll">
          <table className="crm-template-builder__preview-table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.localId}>{c.label.trim() || '항목'}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {columns.map((c) => (
                  <td key={c.localId}>{resolveRowValue(c, draft, useTemplateValues, mockCustomer)}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
