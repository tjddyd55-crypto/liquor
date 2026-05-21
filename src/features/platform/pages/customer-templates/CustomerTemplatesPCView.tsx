import { Link } from 'react-router-dom'
import type { CustomerIndustryTemplate } from '../../../customer-templates/customerTemplate.types'
import type { CustomerTemplatesViewProps } from './CustomerTemplatesPage'

export default function CustomerTemplatesPCView({ templates }: CustomerTemplatesViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--pc page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">고객관리 템플릿</h1>
        <p className="platform-admin-page__lede">
          업종별 정적 정의(조회만). 목록 원천은 <code className="platform-admin-page__mono">STATIC_CUSTOMER_INDUSTRY_TEMPLATES</code> 이며, 세션 업종 코드로 붙일 때는{' '}
          <code className="platform-admin-page__mono">getCustomerIndustryTemplateByIndustryCode</code> 를 사용한다.
          현재 고객 등록 폼(CustomersPage)과는 아직 연결되지 않았고, API·DB로 템플릿을 고치는 빌더는 없다.
        </p>
      </header>

      <div className="platform-admin-page__table-wrap">
        <table className="platform-admin-page__table">
          <thead>
            <tr>
              <th>templateId</th>
              <th>industry</th>
              <th>version</th>
              <th>schema</th>
              <th>폼 필드</th>
              <th>리스트</th>
              <th>탭</th>
              <th>shared</th>
              <th>extension</th>
              <th>미리보기</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.meta.templateId}>
                <td className="platform-admin-page__mono">{t.meta.templateId}</td>
                <td>{t.meta.industryCode}</td>
                <td>{t.meta.version}</td>
                <td>{t.meta.schemaVersion}</td>
                <td>{t.formFields.length}</td>
                <td>{t.listColumns.length}</td>
                <td>{t.detailTabs.length}</td>
                <td>{t.sharedFeatureBindings.length}</td>
                <td>{t.extensionFeatureBindings.length}</td>
                <td>
                  <Link
                    to={`/admin/platform/customer-templates/${encodeURIComponent(t.meta.templateId)}/preview`}
                    className="platform-admin-page__inline-link"
                  >
                    미리보기
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {templates.map((tpl) => (
        <TemplateDetailSection key={tpl.meta.templateId} template={tpl} />
      ))}
    </main>
  )
}

function TemplateDetailSection({ template }: { template: CustomerIndustryTemplate }) {
  return (
    <section className="platform-admin-page__summary-card platform-admin-page__template-detail">
      <h2 className="platform-admin-page__summary-card-title">{template.meta.templateId} 상세</h2>

      <h3 className="platform-admin-page__subhead">formFields</h3>
      <div className="platform-admin-page__table-wrap">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>order</th>
              <th>fieldKey</th>
              <th>label</th>
              <th>widget</th>
              <th>필수</th>
              <th>표시</th>
              <th>privacy</th>
              <th>domain</th>
            </tr>
          </thead>
          <tbody>
            {[...template.formFields]
              .sort((a, b) => a.order - b.order)
              .map((f) => (
                <tr key={f.fieldKey}>
                  <td>{f.order}</td>
                  <td className="platform-admin-page__mono">{f.fieldKey}</td>
                  <td>{f.label}</td>
                  <td>{f.widget}</td>
                  <td>{f.required ? 'Y' : '—'}</td>
                  <td>{f.visibleDefault ? 'Y' : '—'}</td>
                  <td>{f.privacyLevel}</td>
                  <td>{f.domain}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 className="platform-admin-page__subhead">listColumns</h3>
      <div className="platform-admin-page__table-wrap">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>order</th>
              <th>columnKey</th>
              <th>label</th>
              <th>표시</th>
              <th>domain</th>
            </tr>
          </thead>
          <tbody>
            {[...template.listColumns]
              .sort((a, b) => a.order - b.order)
              .map((c) => (
                <tr key={c.columnKey}>
                  <td>{c.order}</td>
                  <td className="platform-admin-page__mono">{c.columnKey}</td>
                  <td>{c.label}</td>
                  <td>{c.visibleDefault ? 'Y' : '—'}</td>
                  <td>{c.domain}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 className="platform-admin-page__subhead">detailTabs</h3>
      <div className="platform-admin-page__table-wrap">
        <table className="platform-admin-page__table platform-admin-page__table--compact">
          <thead>
            <tr>
              <th>order</th>
              <th>tabId</th>
              <th>label</th>
              <th>featureBinding</th>
              <th>표시</th>
              <th>domain</th>
            </tr>
          </thead>
          <tbody>
            {[...template.detailTabs]
              .sort((a, b) => a.order - b.order)
              .map((tab) => (
                <tr key={tab.tabId}>
                  <td>{tab.order}</td>
                  <td className="platform-admin-page__mono">{tab.tabId}</td>
                  <td>{tab.label}</td>
                  <td className="platform-admin-page__mono">{tab.featureBinding}</td>
                  <td>{tab.visibleDefault ? 'Y' : '—'}</td>
                  <td>{tab.domain}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <h3 className="platform-admin-page__subhead">sharedFeatureBindings</h3>
      <ul className="platform-admin-page__mono-list">
        {template.sharedFeatureBindings.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>

      <h3 className="platform-admin-page__subhead">extensionFeatureBindings</h3>
      <ul className="platform-admin-page__mono-list">
        {template.extensionFeatureBindings.map((id) => (
          <li key={id}>{id}</li>
        ))}
      </ul>
    </section>
  )
}
