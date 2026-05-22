/**
 * 주류회사 CRM PDF 템플릿 API (liquor_pdf_templates 전용).
 */
import multer from 'multer'
import { PDFDocument } from 'pdf-lib'
import { inputRoleFromPdfFieldRow } from '../pdf-engine/schema/inputRole.js'
import { createTemplateWithAutoCode } from '../pdf-engine/code/templateCode.js'
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  listFields,
  listTemplates,
  replaceTemplateFields,
} from '../pdf-engine/repository/liquorPdfTemplateRepo.js'
import { reconcileLiquorSignatureFieldSettingsAfterPdfSave } from '../services/liquorSignatureTemplateFieldSettings.js'
import {
  buildLiquorPdfTemplateStorageKey,
  deleteLiquorPdfTemplateObject,
  getLiquorPdfTemplateObject,
  putLiquorPdfTemplateObject,
} from '../pdf-engine/storage/liquorPdfTemplateStorage.js'
import { parseGaId } from '../lib/parseGaId.js'
import { isSuperAdminRole } from '../lib/rbacScope.js'

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function parseTemplateId(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

function templateToDto(row) {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? '',
    pageCount: row.page_count,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function fieldRowToDto(row) {
  return {
    id: row.id,
    fieldKey: row.field_key,
    label: row.label,
    fieldType: row.field_type,
    required: row.required,
    orderIndex: row.order_index,
    inputRole: inputRoleFromPdfFieldRow(row),
    options: Array.isArray(row.options) ? row.options : null,
    placements: Array.isArray(row.placements) ? row.placements : [],
  }
}

function resolveGaFromRequest(req) {
  const isSuper = isSuperAdminRole(req.user?.role)
  if (isSuper) {
    const qGa = parseGaId(
      req.query?.tenant_ga_id ??
        req.query?.tenantGaId ??
        req.query?.ga_id ??
        req.query?.gaId ??
        req.body?.tenant_ga_id ??
        req.body?.tenantGaId ??
        req.body?.ga_id ??
        req.body?.gaId,
    )
    if (qGa != null) return qGa
  }
  const userGa = parseGaId(req.user?.gaId)
  if (userGa != null) return userGa
  const raw = req.body?.gaId ?? req.body?.tenantGaId ?? req.body?.tenant_ga_id ?? req.query?.gaId
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function assertPdfAccess(template, gaId, isSuper) {
  if (!template) return false
  if (isSuper) return true
  if (gaId == null) return false
  return Number(template.ga_id) === Number(gaId)
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, chain: import('express').RequestHandler[], handleDbError: Function }} ctx
 */
export function registerLiquorSignaturePdfTemplateApi(apiRouter, ctx) {
  const { pool, chain, handleDbError } = ctx
  const base = '/liquor/signature-templates/pdf'

  apiRouter.post(
    `${base}/upload`,
    ...chain,
    (req, res, next) => {
      uploadPdf.single('pdf')(req, res, (err) => {
        if (err) {
          res.status(400).json({ message: err.message || 'PDF 업로드 실패' })
          return
        }
        next()
      })
    },
    async (req, res) => {
      try {
        const gaId = resolveGaFromRequest(req)
        const isSuper = isSuperAdminRole(req.user?.role)
        if (!isSuper && gaId == null) {
          res.status(400).json({ message: 'GA 컨텍스트가 필요합니다.' })
          return
        }
        const file = req.file
        if (!file?.buffer?.length) {
          res.status(400).json({ message: 'PDF 파일이 필요합니다.' })
          return
        }
        const doc = await PDFDocument.load(file.buffer)
        const pageCount = doc.getPageCount()
        const storageKey = buildLiquorPdfTemplateStorageKey({ gaId, code: 'upload' })
        await putLiquorPdfTemplateObject(storageKey, file.buffer)
        res.json({ storageKey, pageCount })
      } catch (error) {
        handleDbError(error, req, res)
      }
    },
  )

  apiRouter.post(`${base}`, ...chain, async (req, res) => {
    try {
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      if (!isSuper && gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 필요합니다.' })
        return
      }
      const title = String(req.body?.title ?? '').trim()
      const storageKey = String(req.body?.storageKey ?? '').trim()
      const pageCount = Number(req.body?.pageCount)
      if (!title || !storageKey || !Number.isInteger(pageCount) || pageCount < 1) {
        res.status(400).json({ message: 'title, storageKey, pageCount가 필요합니다.' })
        return
      }
      const row = await createTemplateWithAutoCode(pool, createTemplate, {
        gaId,
        title,
        description: String(req.body?.description ?? ''),
        storageKey,
        pageCount,
        createdByUserId: req.user?.id ?? null,
      })
      res.status(201).json({ template: templateToDto(row) })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get(`${base}/:id`, ...chain, async (req, res) => {
    try {
      const id = parseTemplateId(req.params.id)
      if (!id) {
        res.status(400).json({ message: 'id가 올바르지 않습니다.' })
        return
      }
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const row = await getTemplateById(pool, id)
      if (!assertPdfAccess(row, gaId, isSuper)) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fields = await listFields(pool, id)
      res.json({ template: templateToDto(row), fields: fields.map(fieldRowToDto) })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.put(`${base}/:id/fields`, ...chain, async (req, res) => {
    try {
      const id = parseTemplateId(req.params.id)
      if (!id) {
        res.status(400).json({ message: 'id가 올바르지 않습니다.' })
        return
      }
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const row = await getTemplateById(pool, id)
      if (!assertPdfAccess(row, gaId, isSuper)) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fields = Array.isArray(req.body?.fields) ? req.body.fields : []
      await replaceTemplateFields(pool, id, fields)
      await reconcileLiquorSignatureFieldSettingsAfterPdfSave(pool, id)
      const updated = await listFields(pool, id)
      res.json({ fields: updated.map(fieldRowToDto) })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get(`${base}`, ...chain, async (req, res) => {
    try {
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const rows = await listTemplates(pool, {
        gaId: isSuper && gaId == null ? null : gaId,
        includeInactive: true,
      })
      res.json({ templates: rows.map(templateToDto) })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete(`${base}/:id`, ...chain, async (req, res) => {
    try {
      const id = parseTemplateId(req.params.id)
      if (!id) {
        res.status(400).json({ message: 'id가 올바르지 않습니다.' })
        return
      }
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const row = await getTemplateById(pool, id)
      if (!assertPdfAccess(row, gaId, isSuper)) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      if (row.storage_key) {
        await deleteLiquorPdfTemplateObject(String(row.storage_key))
      }
      await deleteTemplate(pool, id)
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get(`${base}/:id/file`, ...chain, async (req, res) => {
    try {
      const id = parseTemplateId(req.params.id)
      if (!id) {
        res.status(400).json({ message: 'id가 올바르지 않습니다.' })
        return
      }
      const gaId = resolveGaFromRequest(req)
      const isSuper = isSuperAdminRole(req.user?.role)
      const row = await getTemplateById(pool, id)
      if (!assertPdfAccess(row, gaId, isSuper)) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const buf = await getLiquorPdfTemplateObject(String(row.storage_key))
      res.setHeader('Content-Type', 'application/pdf')
      res.send(buf)
    } catch (error) {
      handleDbError(error, req, res)
    }
  })
}
