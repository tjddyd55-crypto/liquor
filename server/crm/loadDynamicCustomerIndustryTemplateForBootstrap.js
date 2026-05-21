import { systemQuery } from '../utils/dbSafeQuery.js'
import { industryAllowsDynamicCrmCustomerTemplates } from './crmDynamicTemplatePolicy.js'
import { mapCrmCustomerManagementRowToIndustryTemplatePayload } from './mapCrmCustomerManagementRowToIndustryTemplate.js'

/**
 * GA → 테넌트 행 + 동적 템플릿 우선순위 적용
 *
 * @param {import('pg').Pool} pool
 * @param {number} gaId
 * @returns {Promise<{
 *   industryCode: string | null,
 *   tenantCrm: Record<string, unknown> | null,
 *   tenantDbId: number | null,
 *   crmCustomerTemplateId: number | null,
 *   crmDynamicIndustryTemplate: Record<string, unknown> | null,
 * }>}
 */
export async function selectCrmBootstrapExtendedForLegacyGa(pool, gaId) {
  const empty = {
    industryCode: null,
    tenantCrm: null,
    tenantDbId: null,
    crmCustomerTemplateId: null,
    crmDynamicIndustryTemplate: null,
  }

  const id = typeof gaId === 'number' ? gaId : Number(gaId)
  if (!Number.isInteger(id) || id <= 0) {
    return empty
  }

  const r = await systemQuery(
    pool,
    `
    SELECT
      i.code AS industry_code,
      (t.config->'crm') AS crm_patch,
      t.id AS tenant_db_id,
      t.crm_customer_template_id AS crm_customer_template_id
    FROM tenants t
    INNER JOIN industries i ON i.id = t.industry_id
    WHERE t.legacy_ga_id = $1
      AND LOWER(COALESCE(t.status::text, 'active')) = 'active'
      AND LOWER(COALESCE(i.status::text, 'active')) = 'active'
    ORDER BY t.id ASC
    LIMIT 1
    `,
    [id],
  )

  const row = r.rows[0]
  if (!row) {
    return empty
  }

  const ic = row.industry_code != null ? String(row.industry_code).trim().toLowerCase() : ''
  const industryCode = ic || null

  const crmPatch = row.crm_patch
  const tenantCrm =
    crmPatch != null && typeof crmPatch === 'object' && !Array.isArray(crmPatch) ? crmPatch : null

  const tenantDbId =
    typeof row.tenant_db_id === 'number' && Number.isInteger(row.tenant_db_id) ? row.tenant_db_id : null

  const tidRaw = row.crm_customer_template_id
  const explicitTemplateId =
    typeof tidRaw === 'number' && Number.isInteger(tidRaw) && tidRaw > 0
      ? tidRaw
      : typeof tidRaw === 'string' && /^\d+$/.test(tidRaw)
        ? Number(tidRaw)
        : null

  /** @type {Record<string, unknown> | null} */
  let crmDynamicIndustryTemplate = null

  if (industryAllowsDynamicCrmCustomerTemplates(industryCode)) {
    let tplRow = null
    if (explicitTemplateId != null) {
      const tr = await systemQuery(
        pool,
        `
        SELECT * FROM crm_customer_management_templates
        WHERE id = $1 AND industry_code = $2 AND status = 'active'
        LIMIT 1
        `,
        [explicitTemplateId, industryCode],
      )
      tplRow = tr.rows[0] ?? null
    }
    if (!tplRow) {
      const tr2 = await systemQuery(
        pool,
        `
        SELECT * FROM crm_customer_management_templates
        WHERE industry_code = $1 AND status = 'active'
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [industryCode],
      )
      tplRow = tr2.rows[0] ?? null
    }
    if (tplRow) {
      crmDynamicIndustryTemplate = mapCrmCustomerManagementRowToIndustryTemplatePayload(tplRow)
    }
  }

  return {
    industryCode,
    tenantCrm,
    tenantDbId,
    crmCustomerTemplateId: explicitTemplateId,
    crmDynamicIndustryTemplate,
  }
}
