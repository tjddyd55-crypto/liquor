import type { PlatformRegistriesViewProps } from './platformRegistriesViewModel'
import { storageMappingKind } from './platformRegistriesViewModel'

export default function PlatformRegistriesPCView({
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
    <main className="page platform-registries-page platform-admin-page platform-registries-page--pc platform-admin-page--pc page--with-back">
      <header className="platform-registries-page__head platform-admin-page__head">
        <h1 className="platform-admin-page__title">필드·기능·리스트 컬럼 레지스트리</h1>
        <p className="platform-admin-page__lede">
          Customer Field / Feature Module / List Column Catalog 정적 조회만 제공합니다. 편집·API 없음 ·
          CustomersPage 미연결.
        </p>
      </header>

      <section className="platform-registries-page__summaries platform-registries-page__summaries--pc">
        <div className="platform-admin-page__summary-card">
          <h2 className="platform-admin-page__summary-card-title">Customer Field Registry</h2>
          <dl className="platform-admin-page__dl">
            <dt>전체 필드 수</dt>
            <dd>{fieldTotals.total}</dd>
            <dt>status: active</dt>
            <dd>{fieldTotals.byStatus.active}</dd>
            <dt>status: preview</dt>
            <dd>{fieldTotals.byStatus.preview}</dd>
            <dt>status: deprecated</dt>
            <dd>{fieldTotals.byStatus.deprecated}</dd>
          </dl>
        </div>

        <div className="platform-admin-page__summary-card">
          <h2 className="platform-admin-page__summary-card-title">Feature Module Registry</h2>
          <dl className="platform-admin-page__dl">
            <dt>전체 기능 수</dt>
            <dd>{featureTotals.total}</dd>
            <dt>status: active</dt>
            <dd>{featureTotals.byStatus.active}</dd>
            <dt>status: preview</dt>
            <dd>{featureTotals.byStatus.preview}</dd>
            <dt>status: deprecated</dt>
            <dd>{featureTotals.byStatus.deprecated}</dd>
          </dl>
        </div>

        <div className="platform-admin-page__summary-card">
          <h2 className="platform-admin-page__summary-card-title">List Column Catalog</h2>
          <dl className="platform-admin-page__dl">
            <dt>전체 리스트 컬럼 수</dt>
            <dd>{listColumnTotals.total}</dd>
            <dt>status: active</dt>
            <dd>{listColumnTotals.byStatus.active}</dd>
            <dt>status: preview</dt>
            <dd>{listColumnTotals.byStatus.preview}</dd>
            <dt>status: deprecated</dt>
            <dd>{listColumnTotals.byStatus.deprecated}</dd>
          </dl>
        </div>
      </section>

      <section className="platform-registries-page__domain-grid platform-registries-page__domain-grid--pc">
        <div className="platform-admin-page__panel">
          <h3 className="platform-admin-page__panel-title">필드 — domain별 항목 수</h3>
          <ul className="platform-registries-page__domain-list">
            {fieldDomains.map((row) => (
              <li key={row.domain}>
                <span className="platform-admin-page__mono">{row.domain}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="platform-admin-page__panel">
          <h3 className="platform-admin-page__panel-title">기능 — domain별 항목 수</h3>
          <ul className="platform-registries-page__domain-list">
            {featureDomains.map((row) => (
              <li key={`f-${row.domain}`}>
                <span className="platform-admin-page__mono">{row.domain}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="platform-admin-page__panel">
          <h3 className="platform-admin-page__panel-title">리스트 컬럼 — domain별 항목 수</h3>
          <ul className="platform-registries-page__domain-list">
            {listColumnDomains.map((row) => (
              <li key={`lc-${row.domain}`}>
                <span className="platform-admin-page__mono">{row.domain}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="platform-admin-page__panel">
          <h3 className="platform-admin-page__panel-title">리스트 컬럼 — sourceType별 수</h3>
          <ul className="platform-registries-page__domain-list">
            {listColumnSourceTypes.map((row) => (
              <li key={row.bucket}>
                <span className="platform-admin-page__mono">{row.bucket}</span>
                <span>{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="platform-registries-page__registry-block">
        <h2 className="platform-admin-page__subhead platform-registries-page__registry-title">Field Registry</h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
          <table className="platform-admin-page__table platform-admin-page__table--compact">
            <thead>
              <tr>
                <th>fieldKey</th>
                <th>label</th>
                <th>category</th>
                <th>domains</th>
                <th>widget</th>
                <th>valueType</th>
                <th>privacyLevel</th>
                <th>storageMapping</th>
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
      </section>

      <section className="platform-registries-page__registry-block">
        <h2 className="platform-admin-page__subhead platform-registries-page__registry-title">
          Feature Module Registry
        </h2>
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
      </section>

      <section className="platform-registries-page__registry-block">
        <h2 className="platform-admin-page__subhead platform-registries-page__registry-title">
          List Column Catalog
        </h2>
        <div className="platform-admin-page__table-wrap platform-admin-page__table-wrap--wide">
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
      </section>
    </main>
  )
}
