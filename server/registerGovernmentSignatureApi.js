/**
 * 정부지원 CRM 전자서명 API 등록 (보험 contract API 와 분리).
 */
import { registerGovernmentSignatureTemplateApi } from './apis/governmentSignatureTemplateApi.js'
import { registerGovernmentSignatureUserApi } from './apis/governmentSignatureUserApi.js'
import { registerGovernmentSignaturePublicApi } from './apis/governmentSignaturePublicApi.js'
import { registerGovernmentSignaturePublicOtpApi } from './apis/governmentSignaturePublicOtpApi.js'
import { registerGovernmentSignaturePdfTemplateApi } from './apis/governmentSignaturePdfTemplateApi.js'
import { createAttachPlatformContext } from './lib/platformRbac.js'
import {
  attachGovernmentSignatureContext,
  requireGovernmentProgramUserSignature,
} from './lib/governmentSignatures/access.js'

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, handleDbError: Function }} ctx
 */
export function registerGovernmentSignatureApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx
  const attachPlatformContext = createAttachPlatformContext(pool)
  const chain = [
    requireAuth,
    attachPlatformContext,
    requireGovernmentProgramUserSignature,
    attachGovernmentSignatureContext,
  ]

  registerGovernmentSignaturePdfTemplateApi(apiRouter, { pool, requireAuth, chain, handleDbError })
  registerGovernmentSignatureTemplateApi(apiRouter, {
    pool,
    requireAuth,
    attachPlatformContext,
    requireGovernmentProgramUserSignature,
    attachGovernmentSignatureContext,
    handleDbError,
  })
  registerGovernmentSignatureUserApi(apiRouter, {
    pool,
    requireAuth,
    attachPlatformContext,
    requireGovernmentProgramUserSignature,
    attachGovernmentSignatureContext,
    handleDbError,
  })
  registerGovernmentSignaturePublicApi(apiRouter, { pool, handleDbError })
  registerGovernmentSignaturePublicOtpApi(apiRouter, { pool, handleDbError })
}
