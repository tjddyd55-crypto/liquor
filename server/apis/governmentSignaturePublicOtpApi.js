import { governmentSignatureOtpSend, governmentSignatureOtpStatus, governmentSignatureOtpVerify } from '../services/governmentSignatureOtpService.js'
import { getClientIp, getClientUserAgent } from '../services/smsRequestIpLimit.js'

/**
 * 공개 계약 링크 — 지정 휴대폰(self_sms) OTP만 (04~ UI·발송 세션 생성은 별도)
 *
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, handleDbError: Function }} ctx
 */
export function registerGovernmentSignaturePublicOtpApi(apiRouter, ctx) {
  const { pool, handleDbError } = ctx

  apiRouter.post('/government-support/public/signatures/:token/otp/send', async (req, res) => {
    try {
      const out = await governmentSignatureOtpSend(pool, {
        signToken: req.params.token,
        clientIp: getClientIp(req),
        userAgent: getClientUserAgent(req),
        body: req.body,
      })
      res.status(out.httpStatus).json(out.payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/government-support/public/signatures/:token/otp/verify', async (req, res) => {
    try {
      const out = await governmentSignatureOtpVerify(pool, {
        signToken: req.params.token,
        codeRaw: req.body?.code,
        clientIp: getClientIp(req),
        userAgent: getClientUserAgent(req),
        body: req.body,
      })
      res.status(out.httpStatus).json(out.payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/government-support/public/signatures/:token/otp/status', async (req, res) => {
    try {
      const out = await governmentSignatureOtpStatus(pool, req.params.token)
      res.status(out.httpStatus).json(out.payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
