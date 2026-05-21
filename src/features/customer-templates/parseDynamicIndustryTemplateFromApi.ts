import type { CustomerIndustryTemplate } from './customerTemplate.types'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 로그인 응답 `crm_dynamic_industry_template`(서버 매퍼 결과) 검증 후 타입 형태만 맞춘다.
 */
export function parseDynamicIndustryTemplateFromApi(raw: unknown): CustomerIndustryTemplate | null {
  if (!isPlainObject(raw)) {
    return null
  }
  const metaRaw = raw.meta
  if (!isPlainObject(metaRaw)) return null
  const templateId = typeof metaRaw.templateId === 'string' ? metaRaw.templateId.trim() : ''
  const industryCode =
    typeof metaRaw.industryCode === 'string' ? metaRaw.industryCode.trim().toLowerCase() : ''
  const version = typeof metaRaw.version === 'string' ? metaRaw.version.trim() : ''
  const schemaVersion = typeof metaRaw.schemaVersion === 'string' ? metaRaw.schemaVersion.trim() : ''
  if (!templateId || !industryCode || !schemaVersion) {
    return null
  }
  const formFieldsIn = raw.formFields
  const listColumnsIn = raw.listColumns
  const detailTabsIn = raw.detailTabs
  const sharedRaw = raw.sharedFeatureBindings
  const extRaw = raw.extensionFeatureBindings
  if (!Array.isArray(formFieldsIn) || !Array.isArray(listColumnsIn)) {
    return null
  }

  const formFields = formFieldsIn.map((f) => ({ ...(f as object) }) as CustomerIndustryTemplate['formFields'][number])
  const listColumns = listColumnsIn.map((c) => ({ ...(c as object) }) as CustomerIndustryTemplate['listColumns'][number])
  const detailTabs = Array.isArray(detailTabsIn)
    ? detailTabsIn.map((t) => ({ ...(t as object) }) as CustomerIndustryTemplate['detailTabs'][number])
    : []
  const sharedFeatureBindings =
    Array.isArray(sharedRaw) ? sharedRaw.map((x) => String(x ?? '')).filter(Boolean) : []
  const extensionFeatureBindings = Array.isArray(extRaw)
    ? extRaw.map((x) => String(x ?? '')).filter(Boolean)
    : []

  const md = raw.metadata
  const metadata = md != null && isPlainObject(md) ? md : undefined

  return {
    meta: {
      templateId,
      industryCode,
      version: version || '1',
      schemaVersion,
      dynamicTemplateDbId:
        typeof metaRaw.dynamicTemplateDbId === 'number' ? metaRaw.dynamicTemplateDbId : undefined,
      status: typeof metaRaw.status === 'string' ? metaRaw.status : undefined,
    },
    formFields,
    listColumns,
    detailTabs,
    sharedFeatureBindings,
    extensionFeatureBindings,
    metadata,
  } as CustomerIndustryTemplate
}
