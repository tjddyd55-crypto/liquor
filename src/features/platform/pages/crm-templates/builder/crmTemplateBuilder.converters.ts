import type {
  CustomerIndustryTemplate,
  CustomerTemplateDetailTab,
  CustomerTemplateFormField,
  CustomerTemplateListColumn,
  CustomerTemplateMeta,
} from '../../../../customer-templates/customerTemplate.types'

import {
  CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES,
  CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES,
  type CrmTemplateBuilderFieldType,
  type CrmTemplateLifecycleStatus,
} from './crmTemplateBuilder.constants'
import type { CrmDraftDetailTab, CrmDraftFormField, CrmDraftListColumn, CrmTemplateDraft } from './crmTemplateBuilder.types'

export function newLocalId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function emptyDraft(): CrmTemplateDraft {
  return {
    formFields: [],
    listColumns: [],
    detailTabs: [],
    sharedFeatureBindings: ['crm-storage-files', 'crm-consultations'],
    extensionFeatureBindings: [],
  }
}

function normalizeFieldType(raw: string): CrmTemplateBuilderFieldType {
  const t = String(raw ?? 'text').toLowerCase()
  return (CRM_TEMPLATE_BUILDER_ALLOWED_FIELD_TYPES as readonly string[]).includes(t)
    ? (t as CrmTemplateBuilderFieldType)
    : 'text'
}

function normalizeListDisplayType(raw: string): CrmDraftListColumn['displayType'] {
  const d = String(raw ?? 'auto').trim().toLowerCase()
  return (CRM_TEMPLATE_LIST_COLUMN_DISPLAY_TYPES as readonly string[]).includes(d)
    ? (d as CrmDraftListColumn['displayType'])
    : 'auto'
}

export function customerIndustryTemplateToDraft(tpl: CustomerIndustryTemplate): CrmTemplateDraft {
  const sortedFields = [...tpl.formFields].sort((a, b) => a.order - b.order)
  const sortedList = [...tpl.listColumns].sort((a, b) => a.order - b.order)
  const sortedTabs = [...tpl.detailTabs].sort((a, b) => a.order - b.order)

  return {
    formFields: sortedFields.map((f) => formFieldResolvedToDraft(f)),
    listColumns: sortedList.map((c) => listColumnResolvedToDraft(c)),
    detailTabs: sortedTabs.map((t) => detailTabResolvedToDraft(t)),
    sharedFeatureBindings: [...tpl.sharedFeatureBindings],
    extensionFeatureBindings: [...tpl.extensionFeatureBindings],
  }
}

function formFieldResolvedToDraft(f: CustomerTemplateFormField): CrmDraftFormField {
  const opts = Array.isArray(f.options) ? f.options.map((o) => ({ value: String(o.value), label: String(o.label) })) : []
  return {
    localId: newLocalId(),
    storage: f.storage ?? 'extension',
    fieldKey: f.fieldKey,
    label: f.label,
    fieldType: normalizeFieldType(String(f.widget)),
    required: Boolean(f.required),
    placeholder: f.placeholder ?? '',
    visibleDefault: f.visibleDefault !== false,
    options: opts,
  }
}

function listColumnResolvedToDraft(c: CustomerTemplateListColumn): CrmDraftListColumn {
  return {
    localId: newLocalId(),
    columnKey: c.columnKey,
    label: c.label,
    sourceFieldKey: String(c.sourceFieldKey ?? ''),
    visibleDefault: c.visibleDefault !== false,
    displayType: normalizeListDisplayType(String(c.displayType ?? 'auto')),
  }
}

function detailTabResolvedToDraft(t: CustomerTemplateDetailTab): CrmDraftDetailTab {
  return {
    localId: newLocalId(),
    tabId: t.tabId,
    label: t.label,
    visibleDefault: t.visibleDefault !== false,
    fieldKeys: Array.isArray(t.fieldKeys) ? [...t.fieldKeys] : [],
  }
}

/** API 저장 바디(snake_case) — 서버 normalize 입력과 동일 */
export function draftToSaveBody(params: {
  name: string
  industry_code: string
  description: string
  status: CrmTemplateLifecycleStatus
  draft: CrmTemplateDraft
}): Record<string, unknown> {
  const ic = params.industry_code.trim().toLowerCase()

  const form_fields = params.draft.formFields.map((f, idx) => {
    const fk = f.storage === 'core' ? f.fieldKey.trim() : f.fieldKey.trim()
    const needsOptions =
      f.fieldType === 'select' || f.fieldType === 'radio' || f.fieldType === 'checkbox'
    const optionsOut = needsOptions
      ? f.options
          .map((o) => ({
            value: String(o.value ?? '').trim().slice(0, 200),
            label: (String(o.label ?? '').trim() || String(o.value ?? '').trim()).slice(0, 200),
          }))
          .filter((o) => o.value.length > 0)
      : []

    return {
      fieldKey: fk,
      label: f.label.trim().slice(0, 200),
      type: f.fieldType,
      widget: f.fieldType,
      required: Boolean(f.required),
      placeholder: f.placeholder.trim().slice(0, 500),
      order: (idx + 1) * 10,
      visibleDefault: f.visibleDefault,
      storage: f.storage,
      options: optionsOut,
      privacyLevel: 'normal',
      domain: ic,
    }
  })

  const list_columns = params.draft.listColumns.map((c, idx) => ({
    columnKey: c.columnKey.trim(),
    label: c.label.trim().slice(0, 200),
    sourceFieldKey: c.sourceFieldKey.trim(),
    order: (idx + 1) * 10,
    visibleDefault: c.visibleDefault,
    displayType: c.displayType ?? 'auto',
    domain: ic,
  }))

  const detail_tabs = params.draft.detailTabs.map((t, idx) => ({
    tabId: t.tabId.trim(),
    label: t.label.trim().slice(0, 200),
    order: (idx + 1) * 10,
    visibleDefault: t.visibleDefault,
    fieldKeys: [...t.fieldKeys],
    domain: ic,
    featureBinding: `dynamic.${t.tabId.trim()}`,
  }))

  return {
    name: params.name.trim().slice(0, 200),
    industry_code: ic,
    description: params.description.trim().slice(0, 2000),
    status: params.status,
    form_fields,
    list_columns,
    detail_tabs,
    shared_feature_bindings: params.draft.sharedFeatureBindings.map((x) => String(x).trim()).filter(Boolean),
    extension_feature_bindings: params.draft.extensionFeatureBindings.map((x) => String(x).trim()).filter(Boolean),
  }
}

/**
 * 서버/스크립트와 동일한 snake_case 저장 바디 → CustomerIndustryTemplate
 * (draftToSaveBody 결과 또는 fixtures/buildLiquorCompanyDynamicCrmTemplateBody 등)
 */
export function customerIndustryTemplateFromApiSaveBody(
  body: Record<string, unknown>,
  meta: CustomerTemplateMeta,
): CustomerIndustryTemplate {
  const ic = String(body.industry_code ?? meta.industryCode ?? '').trim().toLowerCase() || 'unknown'
  const formFieldsRaw = Array.isArray(body.form_fields) ? body.form_fields : []
  const listColumnsRaw = Array.isArray(body.list_columns) ? body.list_columns : []
  const detailTabsRaw = Array.isArray(body.detail_tabs) ? body.detail_tabs : []

  const formFields: CustomerTemplateFormField[] = formFieldsRaw.map((o) => {
    const raw = o as Record<string, unknown>
    const type = String(raw.type ?? raw.widget ?? 'text').toLowerCase() || 'text'
    const storage = String(raw.storage ?? 'extension').toLowerCase() === 'core' ? 'core' : 'extension'
    return {
      fieldKey: String(raw.fieldKey ?? ''),
      label: String(raw.label ?? ''),
      widget: type,
      required: Boolean(raw.required),
      visibleDefault: raw.visibleDefault === false ? false : true,
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      privacyLevel: 'normal',
      domain: ic as CustomerTemplateFormField['domain'],
      placeholder: String(raw.placeholder ?? ''),
      storage,
      options: Array.isArray(raw.options) ? (raw.options as CustomerTemplateFormField['options']) : [],
    }
  })

  const listColumns: CustomerTemplateListColumn[] = listColumnsRaw.map((o) => {
    const raw = o as Record<string, unknown>
    return {
      columnKey: String(raw.columnKey ?? ''),
      label: String(raw.label ?? ''),
      sourceFieldKey: String(raw.sourceFieldKey ?? ''),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      visibleDefault: raw.visibleDefault === false ? false : true,
      domain: ic as CustomerTemplateListColumn['domain'],
      displayType: normalizeListDisplayType(String(raw.displayType ?? raw.display_type ?? 'auto')),
    }
  })

  const detailTabs: CustomerTemplateDetailTab[] = detailTabsRaw.map((o) => {
    const raw = o as Record<string, unknown>
    const tabId = String(raw.tabId ?? '').trim()
    const fkeys = Array.isArray(raw.fieldKeys) ? raw.fieldKeys.map((k) => String(k ?? '').trim()).filter(Boolean) : []
    return {
      tabId,
      label: String(raw.label ?? ''),
      featureBinding: String(raw.featureBinding ?? `dynamic.${tabId}`),
      order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 0,
      domain: ic as CustomerTemplateDetailTab['domain'],
      visibleDefault: raw.visibleDefault === false ? false : true,
      fieldKeys: fkeys,
    }
  })

  return {
    meta: {
      ...meta,
      industryCode: ic,
      schemaVersion: meta.schemaVersion ?? 'customer-template.dynamic.v1',
    },
    formFields,
    listColumns,
    detailTabs,
    sharedFeatureBindings: Array.isArray(body.shared_feature_bindings) ? [...(body.shared_feature_bindings as string[])] : [],
    extensionFeatureBindings: Array.isArray(body.extension_feature_bindings)
      ? [...(body.extension_feature_bindings as string[])]
      : [],
  }
}

/** 저장 API 본문(snake_case) → 빌더 draft (프리셋 적용용) */
export function crmTemplateSaveApiBodyToDraft(body: Record<string, unknown>): CrmTemplateDraft {
  const ic = String(body.industry_code ?? '').trim().toLowerCase() || 'unknown'
  const tpl = customerIndustryTemplateFromApiSaveBody(body, {
    templateId: 'preset',
    industryCode: ic,
    version: '0.1',
    schemaVersion: 'customer-template.dynamic.v1',
  })
  return customerIndustryTemplateToDraft(tpl)
}

/** 미리보기·등록 폼 위젯 — CustomerIndustryTemplate */
export function draftToPreviewIndustryTemplate(
  draft: CrmTemplateDraft,
  industryCodeRaw: string,
  meta?: { templateId: string; version: string; dynamicTemplateDbId?: number; status?: string },
): CustomerIndustryTemplate {
  const ic = industryCodeRaw.trim().toLowerCase() || 'unknown'
  const body = draftToSaveBody({
    name: '__preview__',
    industry_code: ic,
    description: '',
    status: 'active',
    draft,
  })
  const m = meta ?? {
    templateId: 'preview',
    version: 'preview',
  }
  return customerIndustryTemplateFromApiSaveBody(body, {
    templateId: m.templateId,
    industryCode: ic,
    version: m.version,
    schemaVersion: 'customer-template.dynamic.v1',
    ...(meta?.dynamicTemplateDbId != null ? { dynamicTemplateDbId: meta.dynamicTemplateDbId } : {}),
    ...(meta?.status != null ? { status: meta.status } : {}),
  })
}
