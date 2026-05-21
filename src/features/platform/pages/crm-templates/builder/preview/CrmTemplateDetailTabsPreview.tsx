import { useEffect, useMemo, useState } from 'react'

import type { CustomerIndustryTemplate } from '../../../../../customer-templates/customerTemplate.types'
import { industryTemplateReadPreviewRowsForFieldKeys } from '../../../../../customers/utils/industryCustomerReadSummary'

import type { CrmTemplateDraft } from '../crmTemplateBuilder.types'
import { buildStaticPreviewMockCustomer } from './crmTemplatePreviewSampleValues'

type Props = {
  template: CustomerIndustryTemplate | null
  draft: CrmTemplateDraft
}

/** 상세 탭 미리보기 — 샘플 고객·저장 API 없음 */
export default function CrmTemplateDetailTabsPreview({ template, draft }: Props) {
  const tabs = useMemo(
    () =>
      [...draft.detailTabs]
        .filter((t) => t.visibleDefault !== false)
        .sort((a, b) => {
          const ai = draft.detailTabs.findIndex((x) => x.localId === a.localId)
          const bi = draft.detailTabs.findIndex((x) => x.localId === b.localId)
          return ai - bi
        }),
    [draft.detailTabs],
  )

  const [activeId, setActiveId] = useState<string | null>(null)
  const resolvedActiveId = activeId ?? tabs[0]?.tabId ?? tabs[0]?.localId ?? null

  useEffect(() => {
    if (tabs.length === 0) {
      setActiveId(null)
      return
    }
    const ids = tabs.map((t) => t.tabId.trim() || t.localId)
    if (activeId != null && ids.includes(activeId)) return
    setActiveId(ids[0] ?? null)
  }, [tabs, activeId])

  const mockCustomer = useMemo(
    () => buildStaticPreviewMockCustomer(template, draft),
    [template, draft],
  )

  if (tabs.length === 0) {
    return <p className="platform-admin-page__muted text-sm">상세 탭을 추가하면 미리보기가 표시됩니다.</p>
  }

  if (!template) {
    return <p className="platform-admin-page__muted text-sm">Industry를 선택하면 상세 미리보기를 볼 수 있습니다.</p>
  }

  const activeTab = tabs.find((t) => t.tabId === resolvedActiveId || t.localId === resolvedActiveId) ?? tabs[0]

  const rows =
    activeTab.fieldKeys.length > 0
      ? industryTemplateReadPreviewRowsForFieldKeys(mockCustomer, template, activeTab.fieldKeys, 48)
      : []

  return (
    <div className="crm-template-builder__preview-detail">
      <nav className="crm-template-builder__preview-detail-tabs" aria-label="상세 탭 미리보기">
        {tabs.map((t) => {
          const id = t.tabId.trim() || t.localId
          const active = id === (activeTab.tabId.trim() || activeTab.localId)
          return (
            <button
              key={t.localId}
              type="button"
              className={`filter-button text-sm${active ? ' filter-button--workspace-active' : ''}`}
              onClick={() => setActiveId(id)}
            >
              {t.label.trim() || t.tabId || '탭'}
            </button>
          )
        })}
      </nav>
      <section className="crm-template-builder__detail-preview-tab">
        <h3 className="sr-only">{activeTab.label.trim() || activeTab.tabId}</h3>
        {activeTab.fieldKeys.length === 0 ? (
          <p className="platform-admin-page__muted text-sm m-0">
            이 탭에 표시할 필드를 왼쪽에서 선택하세요.
          </p>
        ) : rows.length === 0 ? (
          <dl className="crm-template-builder__preview-dl">
            {activeTab.fieldKeys.map((fk) => {
              const ff = draft.formFields.find((f) => f.fieldKey.trim() === fk.trim())
              return (
                <div key={fk}>
                  <dt>{ff?.label.trim() || fk}</dt>
                  <dd>—</dd>
                </div>
              )
            })}
          </dl>
        ) : (
          <dl className="crm-template-builder__preview-dl">
            {rows.map((r, i) => (
              <div key={`${activeTab.tabId}-${r.canonicalKey}-${i}`}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  )
}
