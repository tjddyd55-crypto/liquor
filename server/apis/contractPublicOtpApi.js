import { contractOtpSend, contractOtpStatus, contractOtpVerify } from '../services/contractOtpService.js'
import { getClientIp, getClientUserAgent } from '../services/smsRequestIpLimit.js'

/**
 * 공개 계약 링크 — 지정 휴대폰(self_sms) OTP만 (04~ UI·발송 세션 생성은 별도)
 *
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, handleDbError: Function }} ctx
 */
export function registerContractPublicOtpApi(apiRouter, ctx) {
  const { pool, handleDbError } = ctx

  apiRouter.post('/contracts/public/:linkCode/otp/send', async (req, res) => {
    try {
      const out = await contractOtpSend(pool, {
        linkCode: req.params.linkCode,
        clientIp: getClientIp(req),
        userAgent: getClientUserAgent(req),
        body: req.body,
      })
      res.status(out.httpStatus).json(out.payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/contracts/public/:linkCode/otp/verify', async (req, res) => {
    try {
      const out = await contractOtpVerify(pool, {
        linkCode: req.params.linkCode,
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

  apiRouter.get('/contracts/public/:linkCode/otp/status', async (req, res) => {
    try {
      const out = await contractOtpStatus(pool, req.params.linkCode)
      res.status(out.httpStatus).json(out.payload)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
