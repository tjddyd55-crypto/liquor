import type { CustomerTemplatePreviewViewModel } from './buildCustomerTemplatePreviewViewModel'

export type CustomerTemplatePreviewViewProps = CustomerTemplatePreviewViewModel

export default function CustomerTemplatePreviewPCView(props: CustomerTemplatePreviewViewProps) {
  if (props.notFound || !props.meta || !props.summary || !props.validation) {
    return (
      <main className="page customer-template-preview-page platform-admin-page customer-template-preview-page--pc platform-admin-page--pc page--with-back">
        <header className="platform-admin-page__head">
          <h1 className="platform-admin-page__title">템플릿 미리보기</h1>
          <p className="platform-admin-page__lede">
            템플릿을 찾을 수 없습니다.{' '}
            <span className="platform-admin-page__mono">{props.unknownTemplateId ?? '—'}</span>
          </p>
        </header>
      </main>
    )
  }

  const { meta, summary, validation } = props

  return (
    <main className="page customer-template-preview-page platform-admin-page customer-template-preview-page--pc platform-admin-page--pc page--with-back">
      <header className="customer-template-preview-page__head platform-admin-page__head">
        <h1 className="platform-admin-page__title">템플릿 빌더 미리보기</h1>
        <p className="platform-admin-page__lede">
          읽기 전용 조회 · 레지스트리 합성 스펙 표 · 저장·편집 없음 · CustomersPage 미연결.
        </p>
      </header>

      <section className="customer-template-preview-page__meta platform-admin-page__summary-card">
        <h2 className="platform-admin-page__summary-card-title">Template Meta</h2>
        <dl className="platform-admin-page__dl">
          <dt>templateId</dt>
          <dd className="platform-admin-page__mono">{meta.templateId}</dd>
          <dt>industryCode</dt>
          <dd>{meta.industryCode}</dd>
          <dt>version</dt>
          <dd>{meta.version}</dd>
          <dt>schemaVersion</dt>
          <dd>{meta.schemaVersion}</dd>
        </dl>
      </section>

      <section className="customer-template-preview-page__summary platform-admin-page__summary-card">
        <h2 className="platform-admin-page__summary-card-title">Summary</h2>
        <dl className="platform-admin-page__dl">
          <dt>formFields</dt>
          <dd>{summary.formFieldsCount}</dd>
          <dt>listColumns</dt>
          <dd>{summary.listColumnsCount}</dd>
          <dt>detailTabs</dt>
          <dd>{summary.detailTabsCount}</dd>
          <dt>sharedFeatureBindings</dt>
          <dd>{summary.sharedFeaturesCount}</dd>
          <dt>extensionFeatureBindings</dt>
          <dd>{summary.extensionFeaturesCount}</dd>
          <dt>validation errors</dt>
          <dd>{summary.validationErrorsCount}</dd>
          <dt>validation warnings</dt>
          <dd>{summary.validationWarningsCount}</dd>
        </dl>
      </section>

      <section className="customer-template-preview-page__validation platform-admin-page__panel">
        <h3 className="platform-admin-page__panel-title">Registry validation</h3>
        <p className="platform-admin-page__stack-meta">
          errors:{' '}
          {validation.errors.length === 0 ? (
            <span className="customer-template-preview-page__ok">없음 (OK)</span>
          ) : (
            <span>{validation.errors.length}건</span>
          )}
        </p>
        {validation.errors.length > 0 && (
          <ul className="platform-admin-page__mono-list">
            {validation.errors.map((msg) => (
              <li key={`e-${msg.slice(0, 80)}`}>{msg}</li>
            ))}
          </ul>
        )}
        <p className="platform-admin-page__stack-meta">
          warnings:{' '}
          {validation.warnings.length === 0 ? (
            <span className="customer-template-preview-page__ok">없음 (OK)</span>
          ) : (
            <span>{validation.warnings.length}건</span>
          )}
        </p>
        {validation.warnings.length > 0 && (
          <ul className="platform-admin-page__mono-list customer-template-preview-page__warn-list">
            {validation.warnings.map((msg) => (
              <li key={`w-${msg.slice(0, 80)}`}>{msg}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="customer-template-preview-page__block">
        <h2 className="platform-admin-page__subhead">Form Field Preview</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>order</th>
                <th>original fieldKey</th>
                <th>canonical fieldKey</th>
                <th>template label</th>
                <th>registry label</th>
                <th>widget</th>
                <th>valueType</th>
                <th>required</th>
                <th>visibleDefault</th>
                <th>privacyLevel</th>
                <th>storageMapping</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {props.formRows.map((row) => (
                <tr key={`${row.order}-${row.originalFieldKey}`}>
                  <td>{row.order}</td>
                  <td className="platform-admin-page__mono">{row.originalFieldKey}</td>
                  <td className="platform-admin-page__mono">{row.canonicalFieldKey}</td>
                  <td>{row.templateLabel}</td>
                  <td>{row.registryLabel ?? '—'}</td>
                  <td>{row.widget ?? '—'}</td>
                  <td>{row.valueType ?? '—'}</td>
                  <td>{row.required ? 'Y' : '—'}</td>
                  <td>{row.visibleDefault ? 'Y' : '—'}</td>
                  <td>{row.privacyLevel ?? '—'}</td>
                  <td>{row.storageMappingKind ?? '—'}</td>
                  <td>{row.registryStatus ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-template-preview-page__block">
        <h2 className="platform-admin-page__subhead">List Column Preview</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>order</th>
                <th>columnKey</th>
                <th>label</th>
                <th>sourceType</th>
                <th>sourceFieldKey</th>
                <th>featureDependency</th>
                <th>valueType</th>
                <th>privacyLevel</th>
                <th>sortable</th>
                <th>filterable</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {props.listColumnRows.map((row) => (
                <tr key={`${row.order}-${row.columnKey}`}>
                  <td>{row.order}</td>
                  <td className="platform-admin-page__mono">{row.columnKey}</td>
                  <td>{row.templateLabel}</td>
                  <td>{row.sourceType ?? '—'}</td>
                  <td className="platform-admin-page__mono">{row.sourceFieldKey ?? '—'}</td>
                  <td className="platform-admin-page__mono">{row.featureDependency ?? '—'}</td>
                  <td>{row.valueType ?? '—'}</td>
                  <td>{row.privacyLevel ?? '—'}</td>
                  <td>{row.sortable != null ? (row.sortable ? 'Y' : '—') : '—'}</td>
                  <td>{row.filterable != null ? (row.filterable ? 'Y' : '—') : '—'}</td>
                  <td>{row.catalogStatus ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-template-preview-page__block">
        <h2 className="platform-admin-page__subhead">Detail Tab Preview</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>order</th>
                <th>tabId</th>
                <th>label</th>
                <th>featureBinding</th>
                <th>feature label</th>
                <th>moduleType</th>
                <th>domains</th>
                <th>visibleDefault</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {props.detailTabRows.map((row) => (
                <tr key={`${row.order}-${row.tabId}`}>
                  <td>{row.order}</td>
                  <td className="platform-admin-page__mono">{row.tabId}</td>
                  <td>{row.templateLabel}</td>
                  <td className="platform-admin-page__mono">{row.featureBinding}</td>
                  <td>{row.featureLabel ?? '—'}</td>
                  <td>{row.moduleType ?? '—'}</td>
                  <td className="platform-admin-page__mono">{row.domains ?? '—'}</td>
                  <td>{row.visibleDefault ? 'Y' : '—'}</td>
                  <td>{row.featureStatus ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-template-preview-page__block">
        <h2 className="platform-admin-page__subhead">Feature Binding Preview — shared</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>featureId</th>
                <th>label</th>
                <th>category</th>
                <th>moduleType</th>
                <th>domains</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {props.sharedFeatureRows.map((row) => (
                <tr key={row.featureId}>
                  <td className="platform-admin-page__mono">{row.featureId}</td>
                  <td>{row.label ?? '—'}</td>
                  <td>{row.category ?? '—'}</td>
                  <td>{row.moduleType ?? '—'}</td>
                  <td className="platform-admin-page__mono">{row.domains ?? '—'}</td>
                  <td>{row.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-template-preview-page__block">
        <h2 className="platform-admin-page__subhead">Feature Binding Preview — extension</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>featureId</th>
                <th>label</th>
                <th>category</th>
                <th>moduleType</th>
                <th>domains</th>
                <th>status</th>
              </tr>
            </thead>
            <tbody>
              {props.extensionFeatureRows.map((row) => (
                <tr key={row.featureId}>
                  <td className="platform-admin-page__mono">{row.featureId}</td>
                  <td>{row.label ?? '—'}</td>
                  <td>{row.category ?? '—'}</td>
                  <td>{row.moduleType ?? '—'}</td>
                  <td className="platform-admin-page__mono">{row.domains ?? '—'}</td>
                  <td>{row.status ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
