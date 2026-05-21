import type { CustomerIndustryTemplate } from '../../../../customer-templates/customerTemplate.types'
import type { CustomerFieldRegistryEntry } from '../../../../customer-templates/registry/customerTemplateRegistry.types'
import {
  getCustomerFieldDefinition,
  getFeatureModuleDefinition,
  getListColumnDefinition,
  resolveCanonicalFieldKey,
  validateCustomerTemplateAgainstRegistries,
  type CustomerTemplateRegistryValidationResult,
} from '../../../../customer-templates/registry/customerTemplateRegistryUtils'
import { PLATFORM_ADMIN_STATIC_CUSTOMER_TEMPLATES } from '../customerTemplatesStaticRegistry'

function fieldStorageMappingKind(mapping: CustomerFieldRegistryEntry['storageMapping']): string {
  return mapping.kind
}

export function resolvePlatformCustomerTemplate(
  templateId: string,
): CustomerIndustryTemplate | null {
  return (
    PLATFORM_ADMIN_STATIC_CUSTOMER_TEMPLATES.find((t) => t.meta.templateId === templateId) ?? null
  )
}

export interface CustomerTemplatePreviewMeta {
  readonly templateId: string
  readonly industryCode: string
  readonly version: string
  readonly schemaVersion: string
}

export interface CustomerTemplatePreviewSummary {
  readonly formFieldsCount: number
  readonly listColumnsCount: number
  readonly detailTabsCount: number
  readonly sharedFeaturesCount: number
  readonly extensionFeaturesCount: number
  readonly validationErrorsCount: number
  readonly validationWarningsCount: number
}

export interface FormFieldPreviewRow {
  readonly order: number
  readonly originalFieldKey: string
  readonly canonicalFieldKey: string
  readonly templateLabel: string
  readonly registryLabel: string | null
  readonly widget: string | null
  readonly valueType: string | null
  readonly required: boolean
  readonly visibleDefault: boolean
  readonly privacyLevel: string | null
  readonly storageMappingKind: string | null
  readonly registryStatus: string | null
}

export interface ListColumnPreviewRow {
  readonly order: number
  readonly columnKey: string
  readonly templateLabel: string
  readonly sourceType: string | null
  readonly sourceFieldKey: string | null
  readonly featureDependency: string | null
  readonly valueType: string | null
  readonly privacyLevel: string | null
  readonly sortable: boolean | null
  readonly filterable: boolean | null
  readonly catalogStatus: string | null
}

export interface DetailTabPreviewRow {
  readonly order: number
  readonly tabId: string
  readonly templateLabel: string
  readonly featureBinding: string
  readonly featureLabel: string | null
  readonly moduleType: string | null
  readonly domains: string | null
  readonly visibleDefault: boolean
  readonly featureStatus: string | null
}

export interface FeatureBindingPreviewRow {
  readonly featureId: string
  readonly label: string | null
  readonly category: string | null
  readonly moduleType: string | null
  readonly domains: string | null
  readonly status: string | null
}

export interface CustomerTemplatePreviewViewModel {
  readonly notFound: boolean
  readonly unknownTemplateId: string | null
  readonly meta: CustomerTemplatePreviewMeta | null
  readonly summary: CustomerTemplatePreviewSummary | null
  readonly validation: CustomerTemplateRegistryValidationResult | null
  readonly formRows: FormFieldPreviewRow[]
  readonly listColumnRows: ListColumnPreviewRow[]
  readonly detailTabRows: DetailTabPreviewRow[]
  readonly sharedFeatureRows: FeatureBindingPreviewRow[]
  readonly extensionFeatureRows: FeatureBindingPreviewRow[]
}

function buildEmptyViewModel(templateIdArg: string | undefined): CustomerTemplatePreviewViewModel {
  const sid = templateIdArg?.trim() || null
  return {
    notFound: true,
    unknownTemplateId: sid,
    meta: null,
    summary: null,
    validation: null,
    formRows: [],
    listColumnRows: [],
    detailTabRows: [],
    sharedFeatureRows: [],
    extensionFeatureRows: [],
  }
}

/** 읽기 전용 Preview — 레지스트리·카탈로그와 조인한 행 생성 */
export function buildCustomerTemplatePreviewViewModel(
  templateId: string | undefined,
): CustomerTemplatePreviewViewModel {
  if (!templateId?.trim()) return buildEmptyViewModel(templateId)
  const template = resolvePlatformCustomerTemplate(templateId.trim())
  if (!template) return buildEmptyViewModel(templateId)

  const validation = validateCustomerTemplateAgainstRegistries(template)

  const formRows = [...template.formFields]
    .sort((a, b) => a.order - b.order)
    .map((ff) => {
      const canonical = resolveCanonicalFieldKey(ff.fieldKey)
      const fdef = getCustomerFieldDefinition(ff.fieldKey)
      return {
        order: ff.order,
        originalFieldKey: ff.fieldKey,
        canonicalFieldKey: canonical,
        templateLabel: ff.label,
        registryLabel: fdef?.label ?? null,
        widget: fdef?.widget ?? null,
        valueType: fdef?.valueType ?? null,
        required: ff.required,
        visibleDefault: ff.visibleDefault,
        privacyLevel: fdef?.privacyLevel ?? null,
        storageMappingKind: fdef ? fieldStorageMappingKind(fdef.storageMapping) : null,
        registryStatus: fdef?.status ?? null,
      } satisfies FormFieldPreviewRow
    })

  const listColumnRows = [...template.listColumns]
    .sort((a, b) => a.order - b.order)
    .map((lc) => {
      const cdef = getListColumnDefinition(lc.columnKey)
      return {
        order: lc.order,
        columnKey: lc.columnKey,
        templateLabel: lc.label,
        sourceType: cdef?.sourceType ?? null,
        sourceFieldKey: cdef?.sourceFieldKey ?? null,
        featureDependency: cdef?.featureDependency ?? null,
        valueType: cdef?.valueType ?? null,
        privacyLevel: cdef?.privacyLevel ?? null,
        sortable: cdef?.sortable ?? null,
        filterable: cdef?.filterable ?? null,
        catalogStatus: cdef?.status ?? null,
      } satisfies ListColumnPreviewRow
    })

  const detailTabRows = [...template.detailTabs]
    .sort((a, b) => a.order - b.order)
    .map((tab) => {
      const m = getFeatureModuleDefinition(tab.featureBinding)
      return {
        order: tab.order,
        tabId: tab.tabId,
        templateLabel: tab.label,
        featureBinding: tab.featureBinding,
        featureLabel: m?.label ?? null,
        moduleType: m?.moduleType ?? null,
        domains: m ? m.domains.join(', ') : null,
        visibleDefault: tab.visibleDefault,
        featureStatus: m?.status ?? null,
      } satisfies DetailTabPreviewRow
    })

  const mapFeatureIds = (ids: readonly string[]): FeatureBindingPreviewRow[] =>
    ids.map((featureId) => {
      const m = getFeatureModuleDefinition(featureId)
      return {
        featureId,
        label: m?.label ?? null,
        category: m?.category ?? null,
        moduleType: m?.moduleType ?? null,
        domains: m ? m.domains.join(', ') : null,
        status: m?.status ?? null,
      }
    })

  const meta: CustomerTemplatePreviewMeta = {
    templateId: template.meta.templateId,
    industryCode: template.meta.industryCode,
    version: template.meta.version,
    schemaVersion: template.meta.schemaVersion,
  }

  const summary: CustomerTemplatePreviewSummary = {
    formFieldsCount: template.formFields.length,
    listColumnsCount: template.listColumns.length,
    detailTabsCount: template.detailTabs.length,
    sharedFeaturesCount: template.sharedFeatureBindings.length,
    extensionFeaturesCount: template.extensionFeatureBindings.length,
    validationErrorsCount: validation.errors.length,
    validationWarningsCount: validation.warnings.length,
  }

  return {
    notFound: false,
    unknownTemplateId: null,
    meta,
    summary,
    validation,
    formRows,
    listColumnRows,
    detailTabRows,
    sharedFeatureRows: mapFeatureIds(template.sharedFeatureBindings),
    extensionFeatureRows: mapFeatureIds(template.extensionFeatureBindings),
  }
}
