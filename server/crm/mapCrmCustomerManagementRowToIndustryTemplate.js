/**
 * DB row → 고객 클라이언트가 쓰는 CustomerIndustryTemplate 형 JSON
 */

function parseJsonArray(val, fallback = []) {
  if (val == null) {
    return [...fallback]
  }
  if (Array.isArray(val)) {
    return val
  }
  if (typeof val === 'string') {
    try {
      const j = JSON.parse(val)
      return Array.isArray(j) ? j : [...fallback]
    } catch {
      return [...fallback]
    }
  }
  return [...fallback]
}

/**
 * @param {Record<string, unknown>} row pg row (snake_case columns)
 */
export function mapCrmCustomerManagementRowToIndustryTemplatePayload(row) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const id = row.id
  const nid = typeof id === 'number' ? id : Number(id)
  if (!Number.isInteger(nid) || nid < 1) {
    return null
  }

  const industryCode = String(row.industry_code ?? '').trim().toLowerCase()
  if (!industryCode) {
    return null
  }

  const formFieldsIn = parseJsonArray(row.form_fields)
  const listColumnsIn = parseJsonArray(row.list_columns)
  const detailTabsIn = parseJsonArray(row.detail_tabs)

  const formFields = formFieldsIn.map((f) => {
    const o = f && typeof f === 'object' && !Array.isArray(f) ? f : {}
    const fk = String(o.fieldKey ?? '').trim()
    const type = String(o.type ?? o.widget ?? 'text').trim().toLowerCase() || 'text'
    const storage = String(o.storage ?? 'extension').trim().toLowerCase() === 'core' ? 'core' : 'extension'
    return {
      fieldKey: fk,
      label: String(o.label ?? '').trim(),
      widget: type,
      required: Boolean(o.required),
      visibleDefault: o.visibleDefault === false ? false : true,
      order: Number.isFinite(Number(o.order)) ? Number(o.order) : 0,
      privacyLevel: String(o.privacyLevel ?? 'normal').trim() || 'normal',
      domain: String(o.domain ?? industryCode).trim() || industryCode,
      placeholder: String(o.placeholder ?? '').trim(),
      sectionId: String(o.sectionId ?? '').trim(),
      sectionLabel: String(o.sectionLabel ?? '').trim(),
      options: Array.isArray(o.options) ? o.options : [],
      storage,
    }
  })

  const listColumns = listColumnsIn.map((c) => {
    const o = c && typeof c === 'object' && !Array.isArray(c) ? c : {}
    const displayRaw = String(o.displayType ?? o.display_type ?? 'auto').trim().toLowerCase()
    const displayType = ['auto', 'text', 'date', 'number'].includes(displayRaw) ? displayRaw : 'auto'
    return {
      columnKey: String(o.columnKey ?? '').trim(),
      label: String(o.label ?? '').trim(),
      sourceFieldKey: String(o.sourceFieldKey ?? '').trim(),
      order: Number.isFinite(Number(o.order)) ? Number(o.order) : 0,
      visibleDefault: o.visibleDefault === false ? false : true,
      domain: String(o.domain ?? industryCode).trim() || industryCode,
      displayType,
    }
  })

  const detailTabs = detailTabsIn.map((t) => {
    const o = t && typeof t === 'object' && !Array.isArray(t) ? t : {}
    const tabId = String(o.tabId ?? '').trim()
    return {
      tabId,
      label: String(o.label ?? '').trim(),
      featureBinding: String(o.featureBinding ?? `dynamic.${tabId}`).trim(),
      order: Number.isFinite(Number(o.order)) ? Number(o.order) : 0,
      domain: String(o.domain ?? industryCode).trim() || industryCode,
      visibleDefault: o.visibleDefault === false ? false : true,
      fieldKeys: Array.isArray(o.fieldKeys) ? o.fieldKeys.map((k) => String(k ?? '').trim()).filter(Boolean) : [],
    }
  })

  const sharedFeatureBindings = parseJsonArray(row.shared_feature_bindings).map(String)
  const extensionFeatureBindings = parseJsonArray(row.extension_feature_bindings).map(String)

  const rev = typeof row.revision === 'number' ? row.revision : Number(row.revision) || 1

  const metadata =
    row.metadata != null && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}

  return {
    meta: {
      templateId: `dynamic:${nid}`,
      industryCode,
      version: String(rev),
      schemaVersion: 'customer-template.dynamic.v1',
      dynamicTemplateDbId: nid,
      status: String(row.status ?? 'active').trim(),
    },
    formFields,
    listColumns,
    detailTabs,
    sharedFeatureBindings,
    extensionFeatureBindings,
    metadata,
  }
}
