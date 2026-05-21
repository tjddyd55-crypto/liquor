import type { CustomerTemplatePreviewViewModel } from './buildCustomerTemplatePreviewViewModel'

export type CustomerTemplatePreviewViewProps = CustomerTemplatePreviewViewModel

export default function CustomerTemplatePreviewMobileView(props: CustomerTemplatePreviewViewProps) {
  if (props.notFound || !props.meta || !props.summary || !props.validation) {
    return (
      <main className="page customer-template-preview-page platform-admin-page customer-template-preview-page--mobile platform-admin-page--mobile page--with-back">
        <header className="platform-admin-page__head">
          <h1 className="platform-admin-page__title">템플릿 미리보기</h1>
          <p className="platform-admin-page__muted">
            템플릿 없음: <span className="platform-admin-page__mono">{props.unknownTemplateId ?? '—'}</span>
          </p>
        </header>
      </main>
    )
  }

  const { meta, summary, validation } = props

  return (
    <main className="page customer-template-preview-page platform-admin-page customer-template-preview-page--mobile platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">미리보기 · {meta.templateId}</h1>
        <p className="platform-admin-page__muted">
          필드 {summary.formFieldsCount} · 리스트 {summary.listColumnsCount} · 검증 에러{' '}
          {summary.validationErrorsCount}
        </p>
      </header>

      <section className="platform-admin-page__stack-card customer-template-preview-page__compact">
        <h2 className="platform-admin-page__stack-title">Template Meta</h2>
        <p className="platform-admin-page__stack-meta platform-admin-page__mono">{meta.templateId}</p>
        <p className="platform-admin-page__stack-meta">
          {meta.industryCode} · v{meta.version} · schema {meta.schemaVersion}
        </p>
      </section>

      <section className="platform-admin-page__stack-card customer-template-preview-page__compact">
        <h2 className="platform-admin-page__stack-title">Validation</h2>
        <p className="platform-admin-page__stack-meta">
          errors:{' '}
          {validation.errors.length === 0 ? (
            <span className="customer-template-preview-page__ok">OK</span>
          ) : (
            validation.errors.length
          )}
          {' · '}warnings:{' '}
          {validation.warnings.length === 0 ? (
            <span className="customer-template-preview-page__ok">OK</span>
          ) : (
            validation.warnings.length
          )}
        </p>
        {validation.errors.length > 0 && (
          <ul className="platform-admin-page__dense-list platform-admin-page__mono">
            {validation.errors.map((m) => (
              <li key={`me-${m.slice(0, 60)}`}>{m}</li>
            ))}
          </ul>
        )}
        {validation.warnings.length > 0 && (
          <ul className="platform-admin-page__dense-list platform-admin-page__mono">
            {validation.warnings.map((m) => (
              <li key={`mw-${m.slice(0, 60)}`}>{m}</li>
            ))}
          </ul>
        )}
      </section>

      <h2 className="platform-admin-page__subhead">Form Field Preview</h2>
      <div className="platform-admin-page__table-wrap customer-template-preview-page__scroll-table">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>original</th>
              <th>canonical</th>
              <th>tmpl 라벨</th>
              <th>widget</th>
              <th>privacy</th>
              <th>storage</th>
            </tr>
          </thead>
          <tbody>
            {props.formRows.map((row) => (
              <tr key={`${row.order}-${row.originalFieldKey}`}>
                <td className="platform-admin-page__mono">{row.originalFieldKey}</td>
                <td className="platform-admin-page__mono">{row.canonicalFieldKey}</td>
                <td>{row.templateLabel}</td>
                <td>{row.widget ?? '—'}</td>
                <td>{row.privacyLevel ?? '—'}</td>
                <td>{row.storageMappingKind ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="platform-admin-page__subhead">List Column Preview</h2>
      <div className="platform-admin-page__table-wrap customer-template-preview-page__scroll-table">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>columnKey</th>
              <th>label</th>
              <th>sourceType</th>
              <th>sourceField</th>
              <th>featureDep</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {props.listColumnRows.map((row) => (
              <tr key={`${row.order}-${row.columnKey}`}>
                <td className="platform-admin-page__mono">{row.columnKey}</td>
                <td>{row.templateLabel}</td>
                <td>{row.sourceType ?? '—'}</td>
                <td className="platform-admin-page__mono">{row.sourceFieldKey ?? '—'}</td>
                <td className="platform-admin-page__mono">{row.featureDependency ?? '—'}</td>
                <td>{row.catalogStatus ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="platform-admin-page__subhead">Detail Tabs</h2>
      <div className="platform-admin-page__table-wrap customer-template-preview-page__scroll-table">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>tabId</th>
              <th>binding</th>
              <th>feature</th>
              <th>type</th>
            </tr>
          </thead>
          <tbody>
            {props.detailTabRows.map((row) => (
              <tr key={`${row.order}-${row.tabId}`}>
                <td className="platform-admin-page__mono">{row.tabId}</td>
                <td className="platform-admin-page__mono">{row.featureBinding}</td>
                <td>{row.featureLabel ?? '—'}</td>
                <td>{row.moduleType ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="platform-admin-page__subhead">Shared features</h2>
      <ul className="platform-admin-page__dense-list platform-admin-page__mono">
        {props.sharedFeatureRows.map((r) => (
          <li key={r.featureId}>
            {r.featureId} · {r.label ?? '—'}
          </li>
        ))}
      </ul>

      <h2 className="platform-admin-page__subhead">Extension features</h2>
      <ul className="platform-admin-page__dense-list platform-admin-page__mono">
        {props.extensionFeatureRows.map((r) => (
          <li key={r.featureId}>
            {r.featureId} · {r.label ?? '—'}
          </li>
        ))}
      </ul>
    </main>
  )
}
