import type { PlatformRegistriesViewProps } from './platformRegistriesViewModel'
import { storageMappingKind } from './platformRegistriesViewModel'

export default function PlatformRegistriesMobileView({
  fieldsSorted,
  featuresSorted,
  listColumnsSorted,
  fieldTotals,
  featureTotals,
  listColumnTotals,
  fieldDomains,
  featureDomains,
  listColumnDomains,
  listColumnSourceTypes,
}: PlatformRegistriesViewProps) {
  return (
    <main className="page platform-registries-page platform-admin-page platform-registries-page--mobile platform-admin-page--mobile page--with-back">
      <header className="platform-registries-page__head platform-admin-page__head">
        <h1 className="platform-admin-page__title">필드·기능·리스트 컬럼</h1>
        <p className="platform-admin-page__muted">
          정적 조회 · 필드 {fieldTotals.total} · 기능 {featureTotals.total} · 리스트 컬럼{' '}
          {listColumnTotals.total}
        </p>
      </header>

      <section className="platform-admin-page__summary-card platform-registries-page__compact-summary">
        <h2 className="platform-admin-page__stack-title">필드 status</h2>
        <p className="platform-admin-page__stack-meta">
          active {fieldTotals.byStatus.active} · preview {fieldTotals.byStatus.preview} · deprecated{' '}
          {fieldTotals.byStatus.deprecated}
        </p>
      </section>
      <section className="platform-admin-page__summary-card platform-registries-page__compact-summary">
        <h2 className="platform-admin-page__stack-title">기능 status</h2>
        <p className="platform-admin-page__stack-meta">
          active {featureTotals.byStatus.active} · preview {featureTotals.byStatus.preview} · deprecated{' '}
          {featureTotals.byStatus.deprecated}
        </p>
      </section>

      <section className="platform-admin-page__summary-card platform-registries-page__compact-summary">
        <h2 className="platform-admin-page__stack-title">리스트 컬럼 status</h2>
        <p className="platform-admin-page__stack-meta">
          active {listColumnTotals.byStatus.active} · preview {listColumnTotals.byStatus.preview} ·
          deprecated {listColumnTotals.byStatus.deprecated}
        </p>
      </section>

      <section className="platform-admin-page__panel">
        <h3 className="platform-admin-page__panel-title">필드 domain</h3>
        <ul className="platform-registries-page__domain-list platform-registries-page__domain-list--mobile">
          {fieldDomains.map((row) => (
            <li key={row.domain}>
              <span className="platform-admin-page__mono">{row.domain}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="platform-admin-page__panel">
        <h3 className="platform-admin-page__panel-title">기능 domain</h3>
        <ul className="platform-registries-page__domain-list platform-registries-page__domain-list--mobile">
          {featureDomains.map((row) => (
            <li key={`mf-${row.domain}`}>
              <span className="platform-admin-page__mono">{row.domain}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="platform-admin-page__panel">
        <h3 className="platform-admin-page__panel-title">리스트 컬럼 domain</h3>
        <ul className="platform-registries-page__domain-list platform-registries-page__domain-list--mobile">
          {listColumnDomains.map((row) => (
            <li key={`ldc-${row.domain}`}>
              <span className="platform-admin-page__mono">{row.domain}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="platform-admin-page__panel">
        <h3 className="platform-admin-page__panel-title">리스트 컬럼 sourceType</h3>
        <ul className="platform-registries-page__domain-list platform-registries-page__domain-list--mobile">
          {listColumnSourceTypes.map((row) => (
            <li key={`st-${row.bucket}`}>
              <span className="platform-admin-page__mono">{row.bucket}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      </section>

      <h2 className="platform-admin-page__subhead">Field Registry</h2>
      <div className="platform-admin-page__table-wrap platform-registries-page__mobile-table">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>fieldKey</th>
              <th>label</th>
              <th>category</th>
              <th>domains</th>
              <th>widget</th>
              <th>valueType</th>
              <th>privacy</th>
              <th>storage</th>
              <th>status</th>
            </tr>
          </thead>
          <tbody>
            {fieldsSorted.map((row) => (
              <tr key={row.fieldKey}>
                <td className="platform-admin-page__mono">{row.fieldKey}</td>
                <td>{row.label}</td>
                <td>{row.category}</td>
                <td className="platform-admin-page__mono">{row.domains.join(', ')}</td>
                <td>{row.widget}</td>
                <td>{row.valueType}</td>
                <td>{row.privacyLevel}</td>
                <td>{storageMappingKind(row.storageMapping)}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="platform-admin-page__subhead">Feature Module Registry</h2>
      <div className="platform-admin-page__table-wrap platform-registries-page__mobile-table">
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
            {featuresSorted.map((row) => (
              <tr key={row.featureId}>
                <td className="platform-admin-page__mono">{row.featureId}</td>
                <td>{row.label}</td>
                <td>{row.category}</td>
                <td>{row.moduleType}</td>
                <td className="platform-admin-page__mono">{row.domains.join(', ')}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="platform-admin-page__subhead">List Column Catalog</h2>
      <div className="platform-admin-page__table-wrap platform-registries-page__mobile-table">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>columnKey</th>
              <th>label</th>
              <th>category</th>
              <th>domains</th>
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
            {listColumnsSorted.map((row) => (
              <tr key={row.columnKey}>
                <td className="platform-admin-page__mono">{row.columnKey}</td>
                <td>{row.label}</td>
                <td>{row.category}</td>
                <td className="platform-admin-page__mono">{row.domains.join(', ')}</td>
                <td>{row.sourceType}</td>
                <td className="platform-admin-page__mono">
                  {row.sourceFieldKey != null ? row.sourceFieldKey : '—'}
                </td>
                <td className="platform-admin-page__mono">
                  {row.featureDependency != null ? row.featureDependency : '—'}
                </td>
                <td>{row.valueType}</td>
                <td>{row.privacyLevel}</td>
                <td>{row.sortable ? 'Y' : '—'}</td>
                <td>{row.filterable ? 'Y' : '—'}</td>
                <td>{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  )
}
