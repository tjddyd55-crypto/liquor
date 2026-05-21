import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import multer from 'multer'
import { fillConsentPdf } from './lib/consentPdfFill.js'
import { safeQuery } from './utils/dbSafeQuery.js'
import {
  consentGetBuffer,
  consentGetSignedDownloadUrl,
  consentPutObject,
  isConsentR2Enabled,
} from './lib/consentStorage.js'

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new Error('PDF 파일만 업로드할 수 있습니다.'))
      return
    }
    cb(null, true)
  },
})

function stripBase64ToBuffer(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return null
  }
  const t = input.trim()
  if (t.startsWith('data:')) {
    const i = t.indexOf('base64,')
    if (i === -1) {
      return null
    }
    try {
      return Buffer.from(t.slice(i + 7), 'base64')
    } catch {
      return null
    }
  }
  try {
    return Buffer.from(t, 'base64')
  } catch {
    return null
  }
}

function signFileJwt(key, kind, JWT_SECRET) {
  return jwt.sign({ scope: 'consent-file', key, kind }, JWT_SECRET, { expiresIn: '15m' })
}

function verifyFileJwt(token, JWT_SECRET) {
  const payload = jwt.verify(token, JWT_SECRET)
  if (payload.scope !== 'consent-file' || typeof payload.key !== 'string' || typeof payload.kind !== 'string') {
    throw new Error('invalid payload')
  }
  return { key: payload.key, kind: payload.kind }
}

function buildPdfResponseUrl(req, jwtToken) {
  const prefix = req.baseUrl?.startsWith('/backend') ? '/backend' : '/api'
  return `${prefix}/consent/file?token=${encodeURIComponent(jwtToken)}`
}

function sanitizeUserIdForPath(userId) {
  const v = String(userId ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
  return v || '_'
}

function normalizeDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

async function resolveConsentCustomerPathId(pool, userId, gaId, body) {
  const explicitIdRaw = body?.customerId ?? body?.customer_id
  const explicitId = Number(explicitIdRaw)
  if (Number.isInteger(explicitId) && explicitId > 0) {
    const own = await safeQuery(
      pool,
      `
      SELECT id
      FROM customers
      WHERE id = $1 AND user_id = $2 AND ga_id = $3 AND deleted_at IS NULL
      LIMIT 1
      `,
      [explicitId, userId, gaId],
    )
    if (own.rowCount > 0) {
      return String(explicitId)
    }
  }

  const ssnDigits = normalizeDigits(body?.formData?.ssn)
  if (ssnDigits.length >= 6) {
    const bySsn = await safeQuery(
      pool,
      `
      SELECT id
      FROM customers
      WHERE user_id = $1
        AND ga_id = $2
        AND deleted_at IS NULL
        AND regexp_replace(COALESCE(ssn, ''), '[^0-9]', '', 'g') = $3
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [userId, gaId, ssnDigits],
    )
    if (bySsn.rowCount > 0) {
      return String(bySsn.rows[0].id)
    }
  }

  // 고객 식별이 어려운 구간도 customers 트리 안으로 강제해 경로 정책을 유지합니다.
  return 'unknown'
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.requireGaAdminOrSuper
 * @param {Function} ctx.requireGaTenantAdmin
 * @param {Function} ctx.resolveTenantGaIdForRequest
 * @param {Function} ctx.isSuperAdminRole
 * @param {Function} ctx.isInsurerManagerRole
 * @param {Function} ctx.parseCompanyScopeId
 * @param {Function} ctx.effectiveTenantGaId
 * @param {Function} ctx.parseGaId
 * @param {Function} ctx.handleDbError
 * @param {string} ctx.JWT_SECRET
 */
export function registerConsentApi(apiRouter, ctx) {
  const {
    pool,
    requireAuth,
    requireGaAdminOrSuper,
    requireGaTenantAdmin,
    resolveTenantGaIdForRequest,
    isSuperAdminRole,
    isInsurerManagerRole,
    parseCompanyScopeId,
    effectiveTenantGaId,
    parseGaId,
    handleDbError,
    JWT_SECRET,
  } = ctx

  /** @param {import('express').Request} req */
  function templateGaScope(req) {
    return parseGaId(req.user?.gaId)
  }

  apiRouter.get('/admin/consent-templates', requireAuth, requireGaAdminOrSuper, async (req, res) => {
    try {
      const g = effectiveTenantGaId(req)
      if (g == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const sql = `
        SELECT id, ga_id, insurance_company_id, fax_number, pdf_storage_key, fields, created_at, updated_at
        FROM consent_templates
        WHERE ga_id = $1
        ORDER BY insurance_company_id ASC
      `
      const r = await safeQuery(pool,sql, [g])
      res.json(r.rows)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/admin/consent-template/:id', requireAuth, requireGaAdminOrSuper, async (req, res) => {
    try {
      const id = String(req.params.id ?? '').trim()
      if (!id) {
        res.status(400).json({ message: 'id가 필요합니다.' })
        return
      }
      const tenantG = effectiveTenantGaId(req)
      if (tenantG == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const sql = `
        SELECT id, ga_id, insurance_company_id, fax_number, pdf_storage_key, fields, created_at, updated_at
        FROM consent_templates
        WHERE id = $1 AND ga_id = $2
      `
      const r = await safeQuery(pool,sql, [id, tenantG])
      if (r.rowCount === 0) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      res.json(r.rows[0])
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/admin/consent-template/:id/pdf', requireAuth, requireGaAdminOrSuper, async (req, res) => {
    try {
      const id = String(req.params.id ?? '').trim()
      if (!id) {
        res.status(400).json({ message: 'id가 필요합니다.' })
        return
      }
      const tenantG = effectiveTenantGaId(req)
      if (tenantG == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const sql = `SELECT pdf_storage_key FROM consent_templates WHERE id = $1 AND ga_id = $2`
      const r = await safeQuery(pool,sql, [id, tenantG])
      if (r.rowCount === 0) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const buf = await consentGetBuffer(String(r.rows[0].pdf_storage_key))
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="template.pdf"')
      res.setHeader('Cache-Control', 'private, no-store')
      res.send(buf)
    } catch (error) {
      console.error('[admin/consent-template pdf]', error)
      res.status(500).json({ message: 'PDF를 불러오지 못했습니다.' })
    }
  })

  apiRouter.get('/consent/templates', requireAuth, async (req, res) => {
    try {
      const gaId = await resolveTenantGaIdForRequest(pool, req)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }

      if (isInsurerManagerRole(req.user?.role)) {
        const cid = parseCompanyScopeId(req.user?.companyId)
        if (cid == null) {
          res.status(403).json({ message: '담당자 계정에 연결된 보험사가 없습니다.' })
          return
        }
        const master = await safeQuery(pool,
          `SELECT company_code FROM insurance_company_master WHERE id = $1 AND ga_id = $2`,
          [cid, gaId],
        )
        if (master.rowCount === 0 || master.rows[0].company_code == null || String(master.rows[0].company_code).trim() === '') {
          res.status(403).json({ message: '해당 보험사 정보를 확인할 수 없습니다.' })
          return
        }
        const code = String(master.rows[0].company_code).trim()
        const r = await safeQuery(pool,
          `
          SELECT id, ga_id, insurance_company_id, fax_number, created_at, updated_at
          FROM consent_templates
          WHERE ga_id = $1 AND insurance_company_id = $2
          ORDER BY insurance_company_id
          `,
          [gaId, code],
        )
        res.json(r.rows)
        return
      }

      const r = await safeQuery(pool,
        `
        SELECT id, ga_id, insurance_company_id, fax_number, created_at, updated_at
        FROM consent_templates
        WHERE ga_id = $1
        ORDER BY insurance_company_id
        `,
        [gaId],
      )
      res.json(r.rows)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post(
    '/admin/consent-template',
    requireAuth,
    requireGaTenantAdmin,
    (req, res, next) => {
      uploadPdf.single('pdf')(req, res, (err) => {
        if (err) {
          res.status(400).json({ message: err.message || '파일 업로드에 실패했습니다.' })
          return
        }
        next()
      })
    },
    async (req, res) => {
      try {
        const gaId = templateGaScope(req)
        if (gaId == null || !Number.isInteger(gaId)) {
          res.status(400).json({ message: 'ga_id가 필요합니다.' })
          return
        }
        const insuranceCompanyId = String(req.body.insurance_company_id ?? '').trim()
        if (!insuranceCompanyId) {
          res.status(400).json({ message: 'insurance_company_id가 필요합니다.' })
          return
        }
        const faxNumber = String(req.body.fax_number ?? '').trim()
        let fields
        try {
          fields = JSON.parse(String(req.body.fields ?? '[]'))
        } catch {
          res.status(400).json({ message: 'fields는 유효한 JSON 배열이어야 합니다.' })
          return
        }
        if (!Array.isArray(fields)) {
          res.status(400).json({ message: 'fields는 배열이어야 합니다.' })
          return
        }

        if (!isSuperAdminRole(req.user?.role)) {
          const ug = parseGaId(req.user?.gaId)
          if (ug == null || ug !== gaId) {
            res.status(403).json({ message: '해당 GA에 대한 권한이 없습니다.' })
            return
          }
        }

        const existing = await safeQuery(pool,
          `SELECT id, pdf_storage_key FROM consent_templates WHERE ga_id = $1 AND insurance_company_id = $2`,
          [gaId, insuranceCompanyId],
        )

        let templateId
        let storageKey

        if (req.file?.buffer) {
          templateId =
            existing.rowCount > 0 ? String(existing.rows[0].id) : randomUUID()
          storageKey = `consent-templates/${templateId}.pdf`
          await consentPutObject(storageKey, req.file.buffer, 'application/pdf')
        } else {
          if (existing.rowCount === 0) {
            res.status(400).json({ message: '신규 등록 시 PDF 파일(pdf)이 필요합니다.' })
            return
          }
          templateId = String(existing.rows[0].id)
          storageKey = String(existing.rows[0].pdf_storage_key)
        }

        const inserted = await safeQuery(pool,
          `
          INSERT INTO consent_templates (id, ga_id, insurance_company_id, fax_number, fields, pdf_storage_key)
          VALUES ($1, $2, $3, $4, CAST($5 AS jsonb), $6)
          ON CONFLICT (ga_id, insurance_company_id)
          DO UPDATE SET
            fax_number = EXCLUDED.fax_number,
            fields = EXCLUDED.fields,
            pdf_storage_key = EXCLUDED.pdf_storage_key,
            updated_at = NOW()
          RETURNING id, ga_id, insurance_company_id, fax_number, created_at, updated_at
          `,
          [templateId, gaId, insuranceCompanyId, faxNumber, JSON.stringify(fields), storageKey],
        )

        res.status(201).json({
          template: inserted.rows[0],
          message: '동의서 템플릿이 저장되었습니다.',
        })
      } catch (error) {
        handleDbError(error, req, res)
      }
    },
  )

  apiRouter.post('/consent/generate', requireAuth, async (req, res) => {
    try {
      const userId = String(req.user?.id ?? '').trim()
      if (!userId) {
        res.status(401).json({ message: '로그인 정보가 올바르지 않습니다.' })
        return
      }

      const tenantGa = await resolveTenantGaIdForRequest(pool, req)
      if (tenantGa == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const gaIdPath = String(tenantGa)
      const userSeg = sanitizeUserIdForPath(userId)

      const consentTemplateId = String(req.body.consent_template_id ?? '').trim()
      if (!consentTemplateId) {
        res.status(400).json({ message: 'consent_template_id가 필요합니다.' })
        return
      }
      const formData = req.body.formData
      if (!formData || typeof formData !== 'object') {
        res.status(400).json({ message: 'formData가 필요합니다.' })
        return
      }
      const signatureRaw = req.body.signature
      const signatureBuf = stripBase64ToBuffer(
        typeof signatureRaw === 'string' ? signatureRaw : '',
      )

      const rowQ = await safeQuery(pool,
        `
        SELECT id, ga_id, insurance_company_id, fields, pdf_storage_key
        FROM consent_templates
        WHERE id = $1 AND ga_id = $2
        `,
        [consentTemplateId, tenantGa],
      )
      if (rowQ.rowCount === 0) {
        res.status(404).json({ message: '동의서 템플릿을 찾을 수 없습니다.' })
        return
      }
      const row = rowQ.rows[0]

      if (isInsurerManagerRole(req.user?.role)) {
        const cid = parseCompanyScopeId(req.user?.companyId)
        if (cid == null) {
          res.status(403).json({ message: '담당자 계정에 연결된 보험사가 없습니다.' })
          return
        }
        const master = await safeQuery(pool,
          `SELECT company_code FROM insurance_company_master WHERE id = $1 AND ga_id = $2`,
          [cid, tenantGa],
        )
        if (
          master.rowCount === 0 ||
          String(master.rows[0].company_code ?? '') !== String(row.insurance_company_id ?? '')
        ) {
          res.status(403).json({ message: '해당 동의서 템플릿에 접근할 수 없습니다.' })
          return
        }
      }

      const templateBytes = await consentGetBuffer(row.pdf_storage_key)
      const filledPdf = await fillConsentPdf(templateBytes, row.fields, formData, signatureBuf)

      const now = new Date()
      const yyyy = String(now.getUTCFullYear())
      const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
      const dd = String(now.getUTCDate()).padStart(2, '0')
      const ts = Date.now()
      const customerPathId = await resolveConsentCustomerPathId(pool, userId, tenantGa, req.body)
      const resultKey = `insurer/${gaIdPath}/${userSeg}/customers/${customerPathId}/consents/${yyyy}/${mm}/${dd}/${ts}_consent-result.pdf`
      await consentPutObject(resultKey, filledPdf, 'application/pdf')

      if (signatureBuf && signatureBuf.length > 0) {
        const sigKey = `insurer/${gaIdPath}/${userSeg}/customers/${customerPathId}/consents/${yyyy}/${mm}/${dd}/${ts}_consent-signature.png`
        await consentPutObject(sigKey, signatureBuf, 'image/png')
      }

      let pdfUrl
      if (isConsentR2Enabled()) {
        pdfUrl = await consentGetSignedDownloadUrl(resultKey, 900)
      } else {
        pdfUrl = buildPdfResponseUrl(req, signFileJwt(resultKey, 'result', JWT_SECRET))
      }

      res.json({ pdfUrl })
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[consent/generate]', error)
      }
      const msg = error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.'
      const isUser =
        msg.includes('폰트') || msg.includes('템플릿') || msg.includes('unicode') || msg.includes('한글')
      res.status(isUser ? 400 : 500).json({
        message: isUser ? msg : 'PDF 생성 중 오류가 발생했습니다.',
      })
    }
  })

  apiRouter.get('/consent/file', async (req, res) => {
    try {
      const token = String(req.query.token ?? '')
      if (!token) {
        res.status(400).send('token이 필요합니다.')
        return
      }
      const { key } = verifyFileJwt(token, JWT_SECRET)
      const buf = await consentGetBuffer(key)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'inline; filename="consent.pdf"')
      res.setHeader('Cache-Control', 'private, no-store')
      res.send(buf)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[consent/file]', error)
      }
      res.status(401).send('다운로드 링크가 만료되었거나 유효하지 않습니다.')
    }
  })
}
