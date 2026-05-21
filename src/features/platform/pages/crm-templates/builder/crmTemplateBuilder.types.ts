import type {
  CrmTemplateBuilderFieldType,
  CrmTemplateLifecycleStatus,
  CrmTemplateListColumnDisplayType,
} from './crmTemplateBuilder.constants'

export type { CrmTemplateLifecycleStatus }

export type CrmTemplateBuilderTabId = 'basic' | 'form' | 'list' | 'detail' | 'preview'

export type CrmDraftFormField = {
  localId: string
  storage: 'core' | 'extension'
  fieldKey: string
  label: string
  fieldType: CrmTemplateBuilderFieldType
  required: boolean
  placeholder: string
  visibleDefault: boolean
  options: { value: string; label: string }[]
}

export type CrmDraftListColumn = {
  localId: string
  columnKey: string
  label: string
  sourceFieldKey: string
  visibleDefault: boolean
  displayType: CrmTemplateListColumnDisplayType
}

export type CrmDraftDetailTab = {
  localId: string
  tabId: string
  label: string
  visibleDefault: boolean
  fieldKeys: string[]
}

export type CrmTemplateDraft = {
  formFields: CrmDraftFormField[]
  listColumns: CrmDraftListColumn[]
  detailTabs: CrmDraftDetailTab[]
  sharedFeatureBindings: string[]
  extensionFeatureBindings: string[]
}

export type CrmTemplateValidationIssue = {
  tab: CrmTemplateBuilderTabId
  localId?: string
  message: string
}
