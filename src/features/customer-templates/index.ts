export type {
  CustomerIndustryTemplate,
  CustomerTemplateDetailTab,
  CustomerTemplateDomain,
  CustomerTemplateFormField,
  CustomerTemplateFormWidget,
  CustomerTemplateListColumn,
  CustomerTemplateMeta,
  CustomerTemplatePrivacyLevel,
  TenantConfigWithCrm,
  TenantCrmConfig,
} from './customerTemplate.types'

export { governmentCustomerTemplateV01 } from './government/governmentCustomerTemplateV01'
export { gymCustomerTemplateV01 } from './gym/gymCustomerTemplateV01'
export { insuranceCustomerTemplateV01 } from './insurance/insuranceCustomerTemplate'
export { resolveCustomerTemplate } from './resolveCustomerTemplate'
export { STATIC_CUSTOMER_INDUSTRY_TEMPLATES } from './staticCustomerIndustryTemplates'
export {
  getCustomerIndustryTemplateByIndustryCode,
  resolveCustomerIndustryTemplateForTenant,
  resolveCustomerIndustryTemplatePreferringDynamic,
} from './selectCustomerIndustryTemplate'

export { parseDynamicIndustryTemplateFromApi } from './parseDynamicIndustryTemplateFromApi'

export { CUSTOMER_FIELD_REGISTRY_BY_KEY } from './registry/customerFieldRegistry'
export { FEATURE_MODULE_REGISTRY_BY_ID } from './registry/featureModuleRegistry'
export { LIST_COLUMN_REGISTRY_BY_KEY } from './registry/listColumnRegistry'
export type {
  CustomerFieldRegistryCategory,
  CustomerFieldRegistryDomain,
  CustomerFieldRegistryEntry,
  CustomerFieldRegistryPrivacyLevel,
  CustomerFieldRegistryStatus,
  CustomerFieldRegistryValidation,
  CustomerFieldRegistryValueType,
  CustomerFieldStorageMapping,
  FeatureModuleApiBinding,
  FeatureModuleRegistryCategory,
  FeatureModuleRegistryConfigSchema,
  FeatureModuleRegistryEntry,
  FeatureModuleRegistryModuleType,
  FeatureModuleRegistryStatus,
  FeatureModuleRouteBinding,
  ListColumnRegistryEntry,
  ListColumnRegistryStatus,
  ListColumnSourceType,
} from './registry/customerTemplateRegistry.types'
export {
  CUSTOMER_FIELD_KEY_ALIAS_TO_CANONICAL,
  getCustomerFieldDefinition,
  getFeatureModuleDefinition,
  getListColumnDefinition,
  resolveCanonicalFieldKey,
  validateCustomerTemplateAgainstRegistries,
} from './registry/customerTemplateRegistryUtils'
export type { CustomerTemplateRegistryValidationResult } from './registry/customerTemplateRegistryUtils'
