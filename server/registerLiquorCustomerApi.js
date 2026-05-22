/**
 * 주류회사 CRM 고객 API 등록.
 */
import { registerLiquorCustomerApi } from './apis/liquorCustomerApi.js'

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, requireAuth: import('express').RequestHandler, handleDbError: Function }} ctx
 */
export function registerLiquorCustomerModule(apiRouter, ctx) {
  registerLiquorCustomerApi(apiRouter, ctx)
}
