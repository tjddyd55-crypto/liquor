import { Link } from 'react-router-dom'
import type { CustomerIndustryTemplate } from '../../../customer-templates/customerTemplate.types'
import type { CustomerTemplatesViewProps } from './CustomerTemplatesPage'

export default function CustomerTemplatesMobileView({ templates }: CustomerTemplatesViewProps) {
  return (
    <main className="page platform-admin-page platform-admin-page--mobile page--with-back">
      <header className="platform-admin-page__head">
        <h1 className="platform-admin-page__title">고객관리 템플릿</h1>
        <p className="platform-admin-page__muted">정적 조회 · SSOT: STATIC_CUSTOMER_INDUSTRY_TEMPLATES</p>
      </header>

      <ul className="platform-admin-page__card-list">
        {templates.map((t) => (
          <li key={t.meta.templateId} className="platform-admin-page__stack-card">
            <div className="platform-admin-page__stack-title platform-admin-page__mono">{t.meta.templateId}</div>
            <div className="platform-admin-page__stack-meta">
              {t.meta.industryCode} · v{t.meta.version} · schema {t.meta.schemaVersion}
            </div>
            <div className="platform-admin-page__stack-meta">
              폼 {t.formFields.length} · 리스트 {t.listColumns.length} · 탭 {t.detailTabs.length}
            </div>
            <div className="platform-admin-page__stack-meta">
              shared {t.sharedFeatureBindings.length} · extension {t.extensionFeatureBindings.length}
            </div>
            <Link
              to={`/admin/platform/customer-templates/${encodeURIComponent(t.meta.templateId)}/preview`}
              className="platform-admin-page__inline-link"
            >
              미리보기
            </Link>
          </li>
        ))}
      </ul>

      {templates.map((tpl) => (
        <MobileTemplateDetail key={tpl.meta.templateId} template={tpl} />
      ))}
    </main>
  )
}

function MobileTemplateDetail({ template }: { template: CustomerIndustryTemplate }) {
  return (
    <section className="platform-admin-page__stack-card platform-admin-page__template-detail--mobile">
      <h2 className="platform-admin-page__stack-title">{template.meta.templateId}</h2>

      <h3 className="platform-admin-page__subhead">formFields</h3>
      <ul className="platform-admin-page__dense-list">
        {[...template.formFields]
          .sort((a, b) => a.order - b.order)
          .map((f) => (
            <li key={f.fieldKey}>
              <span className="platform-admin-page__mono">{f.fieldKey}</span> · {f.label} · {f.widget}{' '}
              {f.required ? '(필수)' : ''}
            </li>
          ))}
      </ul>

      <h3 className="platform-admin-page__subhead">listColumns</h3>
      <ul className="platform-admin-page__dense-list">
        {[...template.listColumns]
          .sort((a, b) => a.order - b.order)
          .map((c) => (
            <li key={c.columnKey}>
              <span className="platform-admin-page__mono">{c.columnKey}</span> · {c.label}
            </li>
          ))}
      </ul>

      <h3 className="platform-admin-page__subhead">detailTabs</h3>
      <ul className="platform-admin-page__dense-list">
        {[...template.detailTabs]
          .sort((a, b) => a.order - b.order)
          .map((tab) => (
            <li key={tab.tabId}>
              <span className="platform-admin-page__mono">{tab.tabId}</span> · {tab.label} ·{' '}
              <span className="platform-admin-page__mono">{tab.featureBinding}</span>
            </li>
          ))}
      </ul>

      <h3 className="platform-admin-page__subhead">featureBindings</h3>
      <p className="platform-admin-page__muted">shared</p>
      <ul className="platform-admin-page__dense-list platform-admin-page__mono">
        {template.sharedFeatureBindings.map((id) => (
          <li key={`s-${id}`}>{id}</li>
        ))}
      </ul>
      <p className="platform-admin-page__muted">extension</p>
      <ul className="platform-admin-page__dense-list platform-admin-page__mono">
        {template.extensionFeatureBindings.map((id) => (
          <li key={`e-${id}`}>{id}</li>
        ))}
      </ul>
    </section>
  )
}
