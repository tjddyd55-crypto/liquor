/**
 * 주류회사 CRM 전자서명 API (보험 contract / 정부 gov_signature 와 분리).
 */
import { registerLiquorSignatureTemplateApi } from './apis/liquorSignatureTemplateApi.js'
import { registerLiquorSignatureUserApi } from './apis/liquorSignatureUserApi.js'
import { registerLiquorSignaturePublicApi } from './apis/liquorSignaturePublicApi.js'
import { registerLiquorSignaturePublicOtpApi } from './apis/liquorSignaturePublicOtpApi.js'
import { registerLiquorSignaturePdfTemplateApi } from './apis/liquorSignaturePdfTemplateApi.js'
import { createAttachPlatformContext } from './lib/platformRbac.js'
import {
  attachLiquorSignatureContext,
  requireLiquorIndustrySignatureAdmin,
  requireLiquorIndustrySignatureUser,
} from './lib/liquorSignatures/access.js'

/**
 * @param {import('express').Router} apiRouter
 * @param {{
 *   pool: import('pg').Pool,
 *   requireAuth: import('express').RequestHandler,
 *   forbidInsurerManagerApi: import('express').RequestHandler,
 *   handleDbError: Function,
 *   isSuperAdminRole: Function,
 * }} ctx
 */
export function registerLiquorSignatureApi(apiRouter, ctx) {
  const { pool, requireAuth, forbidInsurerManagerApi, handleDbError, isSuperAdminRole } = ctx
  const attachPlatformContext = createAttachPlatformContext(pool)

  const userChain = [
    requireAuth,
    attachPlatformContext,
    forbidInsurerManagerApi,
    requireLiquorIndustrySignatureUser,
    attachLiquorSignatureContext,
  ]

  const adminChain = [
    requireAuth,
    attachPlatformContext,
    forbidInsurerManagerApi,
    requireLiquorIndustrySignatureAdmin,
    attachLiquorSignatureContext,
  ]

  registerLiquorSignaturePdfTemplateApi(apiRouter, { pool, chain: adminChain, handleDbError, isSuperAdminRole })
  registerLiquorSignatureTemplateApi(apiRouter, {
    pool,
    requireAuth,
    attachPlatformContext,
    forbidInsurerManagerApi,
    requireLiquorIndustrySignatureAdmin,
    attachLiquorSignatureContext,
    handleDbError,
    isSuperAdminRole,
  })
  registerLiquorSignatureUserApi(apiRouter, {
    pool,
    requireAuth,
    attachPlatformContext,
    forbidInsurerManagerApi,
    requireLiquorIndustrySignatureUser,
    attachLiquorSignatureContext,
    handleDbError,
  })
  registerLiquorSignaturePublicApi(apiRouter, { pool, handleDbError })
  registerLiquorSignaturePublicOtpApi(apiRouter, { pool, handleDbError })
}
