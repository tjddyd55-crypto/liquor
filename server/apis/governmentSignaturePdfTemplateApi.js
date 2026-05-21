/**
 * 정부지원 이용자 전용 PDF 템플릿 API (좌표 에디터 — pdf-engine 재사용).
 */
import multer from 'multer'
import { PDFDocument } from 'pdf-lib'
import { normalizeFieldSpecList } from '../pdf-engine/schema/fieldSpec.js'
import { inputRoleFromPdfFieldRow } from '../pdf-engine/schema/inputRole.js'
import { createTemplateWithAutoCode } from '../pdf-engine/code/templateCode.js'
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  listFields,
  listTemplates,
  replaceTemplateFields,
} from '../pdf-engine/repository/pdfTemplateRepo.js'
import { reconcileGovSignatureFieldSettingsAfterPdfSave } from '../services/governmentSignatureTemplateFieldSettings.js'
import { getTemplateObject, putTemplateObject, deleteTemplateObject } from '../pdf-engine/storage/pdfTemplateStorage.js'
import { getAuthUserId } from '../lib/governmentSignatures/access.js'

const uploadPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

function parseTemplateId(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

function govPdfStorageKey(ownerUserId, code) {
  const safeOwner = String(ownerUserId ?? 'unknown').replace(/[^a-zA-Z0-9_-]+/g, '_')
  const safeCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  return `pdf-templates/gov-user-${safeOwner}/${safeCode}-${Date.now()}.pdf`
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

function assertGovPdfTemplateAccess(template, ownerUserId) {
  if (!template) return false
  return String(template.gov_owner_user_id ?? '') === String(ownerUserId ?? '')
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{ pool: import('pg').Pool, chain: import('express').RequestHandler[], handleDbError: Function }} ctx
 */
export function registerGovernmentSignaturePdfTemplateApi(apiRouter, ctx) {
  const { pool, chain, handleDbError } = ctx
  const base = '/government-support/signature-templates/pdf'

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
        const ownerUserId = getAuthUserId(req)
        if (!ownerUserId) {
          res.status(401).json({ message: '로그인이 필요합니다.' })
          return
        }
        const file = req.file
        if (!file?.buffer?.length) {
          res.status(400).json({ message: 'PDF 파일이 필요합니다.' })
          return
        }
        const pdfDoc = await PDFDocument.load(file.buffer, { ignoreEncryption: true })
        const pageCount = pdfDoc.getPageCount()
        const code = `gov-${ownerUserId.slice(0, 8)}-${Date.now()}`
        const storageKey = govPdfStorageKey(ownerUserId, code)
        await putTemplateObject(storageKey, file.buffer)
        res.status(201).json({ ok: true, storageKey, pageCount, code })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  apiRouter.post(`${base}`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      if (!ownerUserId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const body = req.body ?? {}
      const storageKey = String(body.storageKey ?? '').trim()
      const title = String(body.title ?? '').trim() || '전자서명 PDF'
      const pageCount = Math.max(1, Number(body.pageCount) || 1)
      if (!storageKey) {
        res.status(400).json({ message: 'storageKey 가 필요합니다.' })
        return
      }
      const created = await createTemplateWithAutoCode(pool, createTemplate, {
        gaId: null,
        title,
        description: String(body.description ?? ''),
        storageKey,
        pageCount,
        createdByUserId: ownerUserId,
      })
      await pool.query(`UPDATE pdf_templates SET gov_owner_user_id = $1 WHERE id = $2`, [
        ownerUserId,
        created.id,
      ])
      const full = await pool.query(`SELECT * FROM pdf_templates WHERE id = $1`, [created.id])
      res.status(201).json({ ok: true, template: templateToDto(full.rows[0]) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get(`${base}`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      if (!ownerUserId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const rows = await listTemplates(pool, { gaId: null, includeInactive: true })
      const filtered = rows.filter((r) => String(r.gov_owner_user_id ?? '') === ownerUserId)
      res.json({ ok: true, templates: filtered.map(templateToDto) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get(`${base}/:id`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const id = parseTemplateId(req.params.id)
      if (!ownerUserId || id == null) {
        res.status(400).json({ message: '잘못된 요청입니다.' })
        return
      }
      const template = await getTemplateById(pool, id)
      const govRow = await pool.query(
        `SELECT gov_owner_user_id FROM pdf_templates WHERE id = $1 LIMIT 1`,
        [id],
      )
      const merged = template ? { ...template, gov_owner_user_id: govRow.rows[0]?.gov_owner_user_id } : null
      if (!assertGovPdfTemplateAccess(merged, ownerUserId)) {
        res.status(404).json({ message: 'PDF 템플릿을 찾을 수 없습니다.' })
        return
      }
      const fields = await listFields(pool, id)
      res.json({ ok: true, template: templateToDto(template), fields: fields.map(fieldRowToDto) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.put(`${base}/:id/fields`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const id = parseTemplateId(req.params.id)
      if (!ownerUserId || id == null) {
        res.status(400).json({ message: '잘못된 요청입니다.' })
        return
      }
      const template = await getTemplateById(pool, id)
      const govRow = await pool.query(
        `SELECT gov_owner_user_id FROM pdf_templates WHERE id = $1 LIMIT 1`,
        [id],
      )
      const merged = template ? { ...template, gov_owner_user_id: govRow.rows[0]?.gov_owner_user_id } : null
      if (!assertGovPdfTemplateAccess(merged, ownerUserId)) {
        res.status(404).json({ message: 'PDF 템플릿을 찾을 수 없습니다.' })
        return
      }
      const specs = normalizeFieldSpecList(req.body?.fields ?? req.body ?? [])
      await replaceTemplateFields(pool, id, specs)
      const client = await pool.connect()
      try {
        await reconcileGovSignatureFieldSettingsAfterPdfSave(client, id)
      } finally {
        client.release()
      }
      const fields = await listFields(pool, id)
      res.json({ ok: true, fields: fields.map(fieldRowToDto) })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get(`${base}/:id/file`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const id = parseTemplateId(req.params.id)
      if (!ownerUserId || id == null) {
        res.status(400).json({ message: '잘못된 요청입니다.' })
        return
      }
      const template = await getTemplateById(pool, id)
      const govRow = await pool.query(
        `SELECT gov_owner_user_id FROM pdf_templates WHERE id = $1 LIMIT 1`,
        [id],
      )
      const merged = template ? { ...template, gov_owner_user_id: govRow.rows[0]?.gov_owner_user_id } : null
      if (!assertGovPdfTemplateAccess(merged, ownerUserId)) {
        res.status(404).json({ message: 'PDF 템플릿을 찾을 수 없습니다.' })
        return
      }
      const buf = await getTemplateObject(template.storage_key)
      res.setHeader('Content-Type', 'application/pdf')
      res.send(buf)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.delete(`${base}/:id`, ...chain, async (req, res) => {
    try {
      const ownerUserId = getAuthUserId(req)
      const id = parseTemplateId(req.params.id)
      if (!ownerUserId || id == null) {
        res.status(400).json({ message: '잘못된 요청입니다.' })
        return
      }
      const template = await getTemplateById(pool, id)
      const govRow = await pool.query(
        `SELECT gov_owner_user_id FROM pdf_templates WHERE id = $1 LIMIT 1`,
        [id],
      )
      const merged = template ? { ...template, gov_owner_user_id: govRow.rows[0]?.gov_owner_user_id } : null
      if (!assertGovPdfTemplateAccess(merged, ownerUserId)) {
        res.status(404).json({ message: 'PDF 템플릿을 찾을 수 없습니다.' })
        return
      }
      if (template.storage_key) {
        await deleteTemplateObject(template.storage_key)
      }
      await deleteTemplate(pool, id)
      res.json({ ok: true })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
