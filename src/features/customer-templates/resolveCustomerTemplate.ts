import type {
  CustomerIndustryTemplate,
  CustomerTemplateDetailTab,
  CustomerTemplateFormField,
  TenantConfigWithCrm,
} from './customerTemplate.types'

function cloneIndustryTemplate(base: CustomerIndustryTemplate): CustomerIndustryTemplate {
  return structuredClone(base) as CustomerIndustryTemplate
}

/**
 * Tenant crm 패치만 적용한다. 원본 템플릿 상수는 변하지 않는다.
 *
 * Merge 규칙 (v0.1):
 * - `crm.labels[key]`: `formFields[].fieldKey` 또는 `detailTabs[].tabId`와 일치하면 `label` 덮어쓰기.
 * - `crm.fieldOverrides[fieldKey]`: 해당 폼 필드의 `label` | `required` | `visibleDefault` 만 얕게 병합.
 * - `crm.featureFlags[tabId] === false`: 해당 상세 탭 `visibleDefault` 를 false 로 강제.
 * - `featureFlags[key] === true`: v0.1에서는 무시(베이스 유지).
 */
export function resolveCustomerTemplate(
  baseTemplate: CustomerIndustryTemplate,
  tenantConfig?: TenantConfigWithCrm | null,
): CustomerIndustryTemplate {
  if (!tenantConfig?.crm || isEmptyCrmPatch(tenantConfig.crm)) {
    return cloneIndustryTemplate(baseTemplate)
  }

  const out = cloneIndustryTemplate(baseTemplate)
  const { featureFlags = {}, fieldOverrides = {}, labels = {} } = tenantConfig.crm

  out.formFields = mergeFormFields([...out.formFields], fieldOverrides, labels)
  out.detailTabs = mergeDetailTabs([...out.detailTabs], featureFlags, labels)

  return out
}

function isEmptyCrmPatch(crm: NonNullable<TenantConfigWithCrm['crm']>): boolean {
  const ff = crm.featureFlags && Object.keys(crm.featureFlags).length > 0
  const fo = crm.fieldOverrides && Object.keys(crm.fieldOverrides).length > 0
  const lb = crm.labels && Object.keys(crm.labels).length > 0
  return !ff && !fo && !lb
}

function mergeFormFields(
  fields: CustomerTemplateFormField[],
  fieldOverrides: NonNullable<NonNullable<TenantConfigWithCrm['crm']>['fieldOverrides']>,
  labels: NonNullable<NonNullable<TenantConfigWithCrm['crm']>['labels']>,
): CustomerTemplateFormField[] {
  return fields.map((f) => {
    let next = { ...f }
    const o = fieldOverrides[f.fieldKey]
    if (o) {
      next = { ...next, ...o }
    }
    const labelOverride = labels[f.fieldKey]
    if (labelOverride != null && String(labelOverride).trim()) {
      next = { ...next, label: String(labelOverride).trim() }
    }
    return next
  })
}

function mergeDetailTabs(
  tabs: CustomerTemplateDetailTab[],
  featureFlags: NonNullable<NonNullable<TenantConfigWithCrm['crm']>['featureFlags']>,
  labels: NonNullable<NonNullable<TenantConfigWithCrm['crm']>['labels']>,
): CustomerTemplateDetailTab[] {
  return tabs.map((t) => {
    let next = { ...t }
    const labelOverride = labels[t.tabId]
    if (labelOverride != null && String(labelOverride).trim()) {
      next = { ...next, label: String(labelOverride).trim() }
    }
    if (Object.prototype.hasOwnProperty.call(featureFlags, t.tabId) && featureFlags[t.tabId] === false) {
      next = { ...next, visibleDefault: false }
    }
    return next
  })
}
