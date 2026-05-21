/**
 * 좌표 기반 PDF 자동화 엔진 — REST API.
 *
 * 아키텍처:
 *   - HTTP 입출력만 담당. 도메인 로직은 server/pdf-engine/* 에 위임한다.
 *   - 관리자 쓰기: 업로드·필드 정의 → SUPER_ADMIN 전용.
 *   - 사용자 읽기/발급: 본인 GA 또는 공용(ga_id IS NULL) 템플릿만 허용.
 *
 * 라우트 일람:
 *   POST  /admin/pdf-templates                 — 메타 생성(업로드된 storage_key 포함)
 *   POST  /admin/pdf-templates/upload          — multipart PDF 업로드 → storage_key 반환
 *   GET   /admin/pdf-templates                 — 전체 목록(관리자 뷰)
 *   GET   /admin/pdf-templates/:id             — 단건 + 필드 전체
 *   PATCH /admin/pdf-templates/:id             — 메타(title/description/isActive) 부분 수정
 *   PUT   /admin/pdf-templates/:id/fields      — 필드 + placements 일괄 저장
 *   GET   /admin/pdf-templates/:id/file        — 원본 PDF 바이너리 다운로드(에디터 미리보기)
 *   DELETE /admin/pdf-templates/:id            — 템플릿·스토리지 객체 삭제
 *
 *   GET   /pdf-templates                       — 사용자용 목록(본인 GA + 공용, 활성만)
 *   GET   /pdf-templates/:id                   — 사용자용 단건(권한 내)
 *   GET   /pdf-templates/:id/file              — 사용자용 원본 PDF(권한 내, 활성만)
 *   POST  /pdf-templates/:id/render            — 입력값 → 스탬핑 PDF 스트리밍
 *
 * 권한 체계:
 *   - requireAuth 내부에서 이미 EXPIRED 구독 차단을 수행하므로, 이 라우터는 그 이후를
 *     신뢰하고 "GA 범위" 만 추가로 체크한다.
 */

import multer from 'multer'
import { PDFDocument } from 'pdf-lib'
import {
  fieldSpecWithDbMapping,
  normalizeFieldSpec,
  normalizeFieldSpecList,
  validateRenderValues,
} from './pdf-engine/schema/fieldSpec.js'
import { inputRoleFromPdfFieldRow } from './pdf-engine/schema/inputRole.js'
import { createTemplateWithAutoCode } from './pdf-engine/code/templateCode.js'
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  listFields,
  listTemplates,
  replaceTemplateFields,
  updateTemplateMeta,
} from './pdf-engine/repository/pdfTemplateRepo.js'
import { reconcileContractFieldSettingsAfterPdfSave } from './services/contractTemplateFieldSettings.js'
import { applyCustomerMappingToValues } from './pdf-engine/mapping/resolvePdfFieldValue.js'
import { getCustomerForPdfMapping } from './pdf-engine/repository/customerPdfProfileRepo.js'
import {
  createIssuance,
  getIssuanceById,
  listIssuancesAll,
  listIssuancesByUser,
} from './pdf-engine/repository/pdfIssuanceRepo.js'
import { stampPdf } from './pdf-engine/renderer/stampPdf.js'
import { assertAllTextLayoutsWithEmbeddedFont } from './pdf-engine/renderer/pdfTextLayout.js'
import {
  buildTemplateStorageKey,
  deleteTemplateObject,
  getTemplateObject,
  putTemplateObject,
} from './pdf-engine/storage/pdfTemplateStorage.js'
import {
  buildIssuanceStorageKey,
  getIssuanceObject,
  putIssuanceObject,
} from './pdf-engine/storage/pdfIssuanceStorage.js'
import { canAccessTemplateForUser } from './pdf-engine/security/templateAccess.js'
import {
  getPdfPreviewEntry,
  issuePdfPreviewPdf,
  toSinglePathFilename,
} from './lib/inlinePreviewTokens.js'

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

function parseTemplateId(raw) {
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

function requireSuperAdmin(req, res, isSuperAdminRole) {
  if (!req.user || !isSuperAdminRole(req.user.role)) {
    res.status(403).json({ message: '전체 관리자 권한이 필요합니다.' })
    return false
  }
  return true
}

/**
 * SUPER_ADMIN 전용 라우트의 미들웨어 체인 선두에 배치.
 * multer 같은 리소스 소비형 파서가 비인가 요청을 처리하지 않도록, 권한 체크를 파싱 앞에서 수행한다.
 */
function makeRequireSuperAdminMw(isSuperAdminRole) {
  return (req, res, next) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    next()
  }
}

/* 권한 판정은 security/templateAccess.js 로 이관 — 단위 테스트 용이 + 재사용 대비. */
function canAccessTemplateForRequest(template, req, isSuperAdminRole) {
  return canAccessTemplateForUser(template, req.user ?? null, isSuperAdminRole)
}

function templateToDto(row) {
  return {
    id: row.id,
    gaId: row.ga_id,
    gaName: row.ga_name ?? null,
    gaCode: row.ga_code ?? null,
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
  const base = normalizeFieldSpec(
    {
      fieldKey: row.field_key,
      label: row.label,
      fieldType: row.field_type,
      required: row.required,
      orderIndex: row.order_index,
      inputRole: row.input_role,
      options: Array.isArray(row.options) ? row.options : null,
      placements: Array.isArray(row.placements) ? row.placements : [],
    },
    row.order_index,
  )
  const withMapping = fieldSpecWithDbMapping(base, row.customer_mapping)
  return {
    id: row.id,
    ...withMapping,
    inputRole: inputRoleFromPdfFieldRow(row),
  }
}

function fieldRowsToSpecs(rows) {
  return rows.map((row) => fieldRowToDto(row))
}

function parseBodyCustomerId(body) {
  if (!body || typeof body !== 'object') return null
  const raw = body.customerId
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return null
  return n
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('express').Request} req
 * @param {import('./pdf-engine/schema/fieldSpec.js').FieldSpec[]} fields
 * @param {Record<string, unknown>} valuesForInject
 * @param {boolean} overwriteMode
 */
async function resolvePdfValuesWithCustomerMapping(pool, req, fields, valuesForInject, overwriteMode) {
  const customerId = parseBodyCustomerId(req.body)
  let customer = null
  if (customerId != null) {
    customer = await getCustomerForPdfMapping(pool, (text, params) => pool.query(text, params), req, customerId)
    if (!customer) {
      return { ok: false, status: 404, message: '고객을 찾을 수 없습니다.' }
    }
  }
  const valuesWithProfile = applyCustomerMappingToValues(fields, valuesForInject, customer, {
    overwriteMode,
  })
  return { ok: true, values: valuesWithProfile }
}

function isPreviewRenderRequest(req) {
  const raw = String(req.query?.preview ?? '')
    .trim()
    .toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'preview'
}

/** 스탬핑 결과는 항상 PDF — 템플릿 메타에 남은 xlsx 등 확장자는 표시명에서 제거 후 .pdf 고정 */
function buildPdfRenderContentDispositionBasename(template) {
  const pick = String(template?.title ?? template?.code ?? 'document').trim()
  const noCtrl = pick
    .replace(/[\r\n\u0000]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
  const stripped = noCtrl.replace(/\.(pdf|xlsx?|docx?|png|jpe?g)$/i, '').trim()
  const base = (stripped.length ? stripped : 'document').slice(0, 120)
  return `${base}.pdf`
}

/**
 * 인라인 PDF 스트리밍(Content-Disposition) — 토큰 GET URL 용.
 * @param {string} displayBase
 */
function buildInlinePdfContentDisposition(displayBase) {
  const name = String(displayBase ?? '').trim() || 'document.pdf'
  const ascii =
    name
      .replace(/["\r\n\\]/g, '_')
      .replace(/[^\x20-\x7E]/g, '_')
      .trim()
      .slice(0, 200) || 'document.pdf'
  const star = encodeURIComponent(name)
  return `inline; filename="${ascii}"; filename*=UTF-8''${star}`
}

const PDF_RUNTIME_FIELD_KEY_REGEX = /^[a-z][a-z0-9_]{0,63}$/

function sanitizeClientPdfTemplateValues(raw) {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? { ...raw } : {}
  delete base._pdf_fs
  return base
}

/**
 * 사용자 발급 화면에서만 전달되는 pt 단위 폰트 오버라이드.
 *
 * @param {import('./pdf-engine/schema/fieldSpec.js').FieldSpec[]} fields
 */
function sanitizePdfFontOverrides(fields, raw) {
  const textKeys = new Set(
    fields
      .filter((f) => f.fieldType === 'text' || f.fieldType === 'textarea')
      .map((f) => f.fieldKey),
  )
  const out = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k0, v0] of Object.entries(raw)) {
    const k = String(k0 ?? '')
    if (!PDF_RUNTIME_FIELD_KEY_REGEX.test(k)) continue
    if (!textKeys.has(k)) continue
    const n = Number(v0)
    if (!Number.isFinite(n) || n <= 0) continue
    out[k] = Math.min(40, Math.max(6, Math.round(n * 10) / 10))
  }
  return out
}

/**
 * @param {import('express').Router} apiRouter
 * @param {{
 *   pool: import('pg').Pool,
 *   requireAuth: import('express').RequestHandler,
 *   isSuperAdminRole: (role: unknown) => boolean,
 *   handleDbError: (res: import('express').Response, error: unknown) => void,
 * }} deps
 */
export function registerPdfTemplateApi(apiRouter, deps) {
  const { pool, requireAuth, isSuperAdminRole, handleDbError } = deps
  const requireSuperAdminMw = makeRequireSuperAdminMw(isSuperAdminRole)

  // ─── 관리자 라우트 ────────────────────────────────────────────────

  apiRouter.post(
    '/admin/pdf-templates/upload',
    requireAuth,
    /* 권한을 multer 앞에 두어 비인가 요청이 25MB 멀티파트 파싱을 강제하지 못하게 한다. */
    requireSuperAdminMw,
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
      const file = req.file
      if (!file || !file.buffer || file.buffer.length === 0) {
        res.status(400).json({ message: 'PDF 파일이 필요합니다.' })
        return
      }
      const gaIdRaw = req.body?.gaId
      const gaId =
        gaIdRaw == null || gaIdRaw === '' || gaIdRaw === 'null' ? null : Number(gaIdRaw)
      if (gaId != null && (!Number.isInteger(gaId) || gaId < 1)) {
        res.status(400).json({ message: 'gaId 가 올바르지 않습니다.' })
        return
      }
      /* 스토리지 키는 업로드 시점에 고정되며, UUID 접미어로 유일성이 보장된다.
         템플릿의 최종 `code` 는 등록(POST /admin/pdf-templates) 시점에 서버가
         자동 생성하므로, 업로드 단계에서는 내부 버킷 정리용 접두어만 필요하다. */
      const STORAGE_KEY_SEED = 'upload'

      try {
        /* 페이지 수 미리 계산 — 프론트에서 재요청하지 않아도 되게 서버가 고정. */
        const doc = await PDFDocument.load(file.buffer)
        const pageCount = doc.getPageCount()
        const storageKey = buildTemplateStorageKey({ gaId, code: STORAGE_KEY_SEED })
        await putTemplateObject(storageKey, file.buffer)
        res.json({ storageKey, pageCount })
      } catch (error) {
        console.error('[pdf-templates] 업로드 실패', error)
        res.status(500).json({ message: 'PDF 업로드에 실패했습니다.' })
      }
    },
  )

  apiRouter.post('/admin/pdf-templates', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const gaIdRaw = body.gaId
    const gaId =
      gaIdRaw == null || gaIdRaw === '' || gaIdRaw === 'null' ? null : Number(gaIdRaw)
    if (gaId != null && (!Number.isInteger(gaId) || gaId < 1)) {
      res.status(400).json({ message: 'gaId 가 올바르지 않습니다.' })
      return
    }
    /* `code` 는 더 이상 클라이언트에서 받지 않는다(서버가 title 로부터 자동 생성).
       기존 호출자가 code 를 보내도 무시 — 하위 호환을 위한 silent ignore. */
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      res.status(400).json({ message: 'title 이 필요합니다.' })
      return
    }
    const description = typeof body.description === 'string' ? body.description.trim() : ''
    const storageKey = typeof body.storageKey === 'string' ? body.storageKey.trim() : ''
    if (!storageKey) {
      res.status(400).json({ message: 'storageKey 가 필요합니다. 먼저 업로드를 호출하세요.' })
      return
    }
    const pageCount = Number(body.pageCount)
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      res.status(400).json({ message: 'pageCount 가 올바르지 않습니다.' })
      return
    }

    try {
      /* code 자동 생성 + 충돌 재시도는 createTemplateWithAutoCode 에 일임한다.
         라우터는 "요청을 받고 응답을 낸다" 에만 집중한다. */
      const row = await createTemplateWithAutoCode(pool, createTemplate, {
        gaId,
        title,
        description,
        storageKey,
        pageCount,
        createdByUserId: req.user?.id ?? null,
      })
      res.status(201).json({ template: templateToDto(row) })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.get('/admin/pdf-templates', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    try {
      const rows = await listTemplates(pool, { gaId: null, includeInactive: true })
      res.json({ templates: rows.map(templateToDto) })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.get('/admin/pdf-templates/:id', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const row = await getTemplateById(pool, id)
      if (!row) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fields = await listFields(pool, id)
      res.json({
        template: templateToDto(row),
        fields: fields.map(fieldRowToDto),
      })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.patch('/admin/pdf-templates/:id', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const patch = {}
    if (typeof body.title === 'string') {
      const v = body.title.trim()
      if (!v) {
        res.status(400).json({ message: 'title 은 비워둘 수 없습니다.' })
        return
      }
      patch.title = v
    }
    if (typeof body.description === 'string') {
      patch.description = body.description.trim()
    }
    if (body.isActive !== undefined) {
      patch.isActive = Boolean(body.isActive)
    }

    try {
      await updateTemplateMeta(pool, id, patch)
      const row = await getTemplateById(pool, id)
      res.json({ template: row ? templateToDto(row) : null })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.put('/admin/pdf-templates/:id/fields', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const fields = normalizeFieldSpecList(req.body?.fields)
      for (const f of fields) {
        if (f.fieldType !== 'signature') {
          f.inputRole = 'customer'
        }
      }
      const template = await getTemplateById(pool, id)
      if (!template) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      /* placements 의 page 값이 실제 페이지 수를 넘지 않는지 재검증(스키마만으로 모자람). */
      for (const f of fields) {
        for (const p of f.placements) {
          if (p.page >= template.page_count) {
            res.status(400).json({
              message: `필드 "${f.fieldKey}" 의 placement.page(${p.page}) 가 페이지 수(${template.page_count}) 를 초과합니다.`,
            })
            return
          }
        }
      }
      await replaceTemplateFields(pool, id, fields)
      await reconcileContractFieldSettingsAfterPdfSave(pool, id)
      const rows = await listFields(pool, id)
      res.json({ fields: rows.map(fieldRowToDto) })
    } catch (error) {
      if (error instanceof Error && /필드|placement|허용되지|중복|배열/.test(error.message)) {
        res.status(400).json({ message: error.message })
        return
      }
      handleDbError(res, error)
    }
  })

  apiRouter.get('/admin/pdf-templates/:id/file', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.', code: 'invalid-id' })
      return
    }
    /*
     * 실패 지점을 code 로 분리해 응답한다:
     *   - template-not-found: DB 에 해당 템플릿 없음
     *   - template-lookup-failed: DB 조회 자체가 실패
     *   - storage-fetch-failed: R2 등 스토리지에서 객체를 가져오지 못함
     * 클라이언트는 logger 가 서버 message/code 를 그대로 기록한다.
     */
    let template
    try {
      template = await getTemplateById(pool, id)
    } catch (error) {
      console.error('[pdf-templates] file lookup 실패', { id, error })
      res.status(500).json({
        message: '템플릿 조회 중 오류가 발생했습니다.',
        code: 'template-lookup-failed',
      })
      return
    }
    if (!template) {
      res.status(404).json({
        message: '템플릿을 찾을 수 없습니다.',
        code: 'template-not-found',
      })
      return
    }
    try {
      const buf = await getTemplateObject(template.storage_key)
      /*
       * 진단 로깅: 클라이언트가 "0 바이트를 받았다" 고 보고했지만 원인이 서버/프록시/클라이언트
       * 중 어디인지 불명확한 상태를 해결하기 위한 최소 관찰 포인트다.
       * 여기서 기록하는 byteLength 와 클라이언트가 arrayBuffer().byteLength 로 측정한 값이
       * 다르면 그 사이 경로(Railway edge/압축/캐시) 가 범인이 된다.
       * 운영 노이즈를 줄이려 warn 이 아닌 info 로 둔다(Railway 는 info 도 수집).
       */
      console.info('[pdf-templates] file serve', {
        id,
        storageKey: template.storage_key,
        byteLength: buf?.length ?? 0,
        userAgent: req.headers['user-agent'] ?? null,
      })
      if (!buf || buf.length === 0) {
        /* 스토리지가 0 바이트 객체를 반환하면 클라이언트에 "형식 파싱 실패" 로 오인되어
           도달한다. 여기서 502 로 끊어 UX 와 책임 소재를 명확히 한다. */
        console.error('[pdf-templates] storage returned empty buffer', {
          id,
          storageKey: template.storage_key,
        })
        res.status(502).json({
          message: '원본 PDF 가 비어 있습니다. 업로드를 다시 시도해 주세요.',
          code: 'storage-empty-object',
        })
        return
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', String(buf.length))
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
      res.send(buf)
    } catch (error) {
      console.error('[pdf-templates] storage fetch 실패', {
        id,
        storageKey: template.storage_key,
        error,
      })
      res.status(502).json({
        message: '원본 PDF 를 가져오지 못했습니다.',
        code: 'storage-fetch-failed',
      })
    }
  })

  apiRouter.delete('/admin/pdf-templates/:id', requireAuth, async (req, res) => {
    if (!requireSuperAdmin(req, res, isSuperAdminRole)) return
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const template = await getTemplateById(pool, id)
      if (!template) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      /*
       * 스토리지 먼저 지우고 DB 를 지운다.
       * 스토리지 삭제가 실패하면 DB row 를 남겨두고 에러를 반환해야 orphan 객체를 재시도로 정리할 수 있다.
       * (DB 만 날려버리면 복구 단서가 사라진다.)
       */
      try {
        await deleteTemplateObject(template.storage_key)
      } catch (storageError) {
        console.error('[pdf-templates] 스토리지 삭제 실패 — DB row 유지', storageError)
        res.status(502).json({
          message: '원본 PDF 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요.',
        })
        return
      }
      await deleteTemplate(pool, id)
      res.status(204).end()
    } catch (error) {
      handleDbError(res, error)
    }
  })

  // ─── 사용자 라우트 ────────────────────────────────────────────────

  apiRouter.get('/pdf-templates', requireAuth, async (req, res) => {
    try {
      const isSuper = isSuperAdminRole(req.user?.role)
      /* 비관리자 계정에 GA 컨텍스트가 없으면 전체 노출 위험이 있으므로 명시적으로 거절한다. */
      if (!isSuper && req.user?.gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없는 계정은 문서 목록을 조회할 수 없습니다.' })
        return
      }
      const gaIdForFilter = isSuper ? null : req.user?.gaId ?? null
      const rows = await listTemplates(pool, { gaId: gaIdForFilter, includeInactive: false })
      res.json({ templates: rows.map(templateToDto) })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.get('/pdf-templates/:id', requireAuth, async (req, res) => {
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const template = await getTemplateById(pool, id)
      if (!canAccessTemplateForRequest(template, req, isSuperAdminRole) || !template.is_active) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fields = await listFields(pool, id)
      res.json({
        template: templateToDto(template),
        fields: fields.map(fieldRowToDto),
      })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  apiRouter.get('/pdf-templates/:id/file', requireAuth, async (req, res) => {
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.', code: 'invalid-id' })
      return
    }
    let template
    try {
      template = await getTemplateById(pool, id)
    } catch (error) {
      console.error('[pdf-templates] user file lookup 실패', { id, error })
      res.status(500).json({
        message: '템플릿 조회 중 오류가 발생했습니다.',
        code: 'template-lookup-failed',
      })
      return
    }
    if (!template || !canAccessTemplateForRequest(template, req, isSuperAdminRole) || !template.is_active) {
      res.status(404).json({
        message: '템플릿을 찾을 수 없습니다.',
        code: 'template-not-found',
      })
      return
    }
    try {
      const buf = await getTemplateObject(template.storage_key)
      if (!buf || buf.length === 0) {
        res.status(502).json({
          message: '원본 PDF 가 비어 있습니다. 관리자에게 문의해 주세요.',
          code: 'storage-empty-object',
        })
        return
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', String(buf.length))
      res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate')
      res.send(buf)
    } catch (error) {
      console.error('[pdf-templates] user storage fetch 실패', {
        id,
        storageKey: template.storage_key,
        error,
      })
      res.status(502).json({
        message: '원본 PDF 를 가져오지 못했습니다.',
        code: 'storage-fetch-failed',
      })
    }
  })

  apiRouter.post('/pdf-templates/:id/render', requireAuth, async (req, res) => {
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const previewOnly = isPreviewRenderRequest(req)
      const template = await getTemplateById(pool, id)
      if (!canAccessTemplateForRequest(template, req, isSuperAdminRole) || !template.is_active) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fieldRows = await listFields(pool, id)
      const fields = fieldRowsToSpecs(fieldRows)
      const valuesRaw =
        req.body && typeof req.body.values === 'object' && req.body.values !== null
          ? req.body.values
          : {}
      const valuesForInject = sanitizeClientPdfTemplateValues(valuesRaw)
      const fontOverridesRaw =
        req.body && typeof req.body.fontSizes === 'object' && req.body.fontSizes !== null
          ? req.body.fontSizes
          : {}
      const overwriteMapping = req.body?.overwriteCustomerMapping === true
      const mapped = await resolvePdfValuesWithCustomerMapping(
        pool,
        req,
        fields,
        valuesForInject,
        overwriteMapping,
      )
      if (!mapped.ok) {
        res.status(mapped.status).json({ message: mapped.message })
        return
      }
      const valuesWithProfile = mapped.values
      const validation = validateRenderValues(fields, valuesWithProfile)
      if (!validation.ok) {
        res.status(400).json({ message: validation.error })
        return
      }
      const fontOverrides = sanitizePdfFontOverrides(fields, fontOverridesRaw)
      const layoutCheck = await assertAllTextLayoutsWithEmbeddedFont(
        fields,
        validation.normalized,
        fontOverrides,
      )
      if (!layoutCheck.ok) {
        res.status(400).json({ message: layoutCheck.message ?? '입력값이 허용된 영역을 초과했습니다.' })
        return
      }

      const templateBytes = await getTemplateObject(template.storage_key)
      const rendered = await stampPdf(
        templateBytes,
        fields,
        validation.normalized,
        {},
        fontOverrides,
      )

      /*
       * 발급 이력 기록. 스탬핑이 성공한 뒤에만 저장한다 — 실패한 바이트를 보존할 이유가 없다.
       * 스토리지/DB 저장 실패는 사용자 다운로드를 막지 않는다(이력 기록이 로깅 용도라기보다는
       * 보조적인 감사 장치라서, 발급 자체를 실패 처리하면 사용자 입장에서 과한 UX 다).
       * 다만 에러는 서버 로그에 남겨 추후 조사 가능하도록 한다.
       */
      let issuanceId = null
      if (!previewOnly) {
        try {
          const storageKey = buildIssuanceStorageKey()
          await putIssuanceObject(storageKey, Buffer.from(rendered))
          const valuesSnapshot =
            Object.keys(fontOverrides).length > 0
              ? {
                  ...validation.normalized,
                  _pdf_fs: JSON.stringify(fontOverrides),
                }
              : { ...validation.normalized }
          const row = await createIssuance(pool, {
            templateId: template.id,
            userId: req.user?.id ?? null,
            gaId: template.ga_id ?? null,
            templateCode: template.code,
            templateTitle: template.title,
            storageKey,
            valuesSnapshot,
            byteLength: rendered.length ?? rendered.byteLength ?? 0,
          })
          issuanceId = row?.id ?? null
        } catch (archiveError) {
          console.error('[pdf-templates] 이력 기록 실패 (발급은 정상 진행)', archiveError)
        }
      }

      const displayBase = buildPdfRenderContentDispositionBasename(template)
      const filenameStar = encodeURIComponent(displayBase)
      const asciiFallback = displayBase.replace(/[^\x20-\x7E]/g, '_') || 'document.pdf'
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader(
        'Content-Disposition',
        `${previewOnly ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${filenameStar}`,
      )
      res.setHeader('Cache-Control', 'private, no-store')
      if (!previewOnly && issuanceId != null) {
        /* 프론트가 이력 화면으로 이동할 때 방금 생성된 이력을 바로 가리키도록 힌트를 내려준다. */
        res.setHeader('X-Issuance-Id', String(issuanceId))
      }
      res.send(rendered)
    } catch (error) {
      console.error('[pdf-templates] render 실패', error)
      const msg = error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.'
      res.status(500).json({ message: msg })
    }
  })

  apiRouter.post('/pdf-templates/:id/render-preview', requireAuth, async (req, res) => {
    const id = parseTemplateId(req.params.id)
    if (!id) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const template = await getTemplateById(pool, id)
      if (!canAccessTemplateForRequest(template, req, isSuperAdminRole) || !template.is_active) {
        res.status(404).json({ message: '템플릿을 찾을 수 없습니다.' })
        return
      }
      const fieldRows = await listFields(pool, id)
      const fields = fieldRowsToSpecs(fieldRows)
      const valuesRaw =
        req.body && typeof req.body.values === 'object' && req.body.values !== null
          ? req.body.values
          : {}
      const valuesForInject = sanitizeClientPdfTemplateValues(valuesRaw)
      const fontOverridesRaw =
        req.body && typeof req.body.fontSizes === 'object' && req.body.fontSizes !== null
          ? req.body.fontSizes
          : {}
      const overwriteMapping = req.body?.overwriteCustomerMapping === true
      const mapped = await resolvePdfValuesWithCustomerMapping(
        pool,
        req,
        fields,
        valuesForInject,
        overwriteMapping,
      )
      if (!mapped.ok) {
        res.status(mapped.status).json({ message: mapped.message })
        return
      }
      const valuesWithProfile = mapped.values
      const validation = validateRenderValues(fields, valuesWithProfile)
      if (!validation.ok) {
        res.status(400).json({ message: validation.error })
        return
      }
      const fontOverrides = sanitizePdfFontOverrides(fields, fontOverridesRaw)
      const layoutCheck = await assertAllTextLayoutsWithEmbeddedFont(
        fields,
        validation.normalized,
        fontOverrides,
      )
      if (!layoutCheck.ok) {
        res.status(400).json({ message: layoutCheck.message ?? '입력값이 허용된 영역을 초과했습니다.' })
        return
      }

      const templateBytes = await getTemplateObject(template.storage_key)
      const rendered = await stampPdf(
        templateBytes,
        fields,
        validation.normalized,
        {},
        fontOverrides,
      )

      const rawDisplay =
        req.body && typeof req.body.displayFilename === 'string' ? String(req.body.displayFilename).trim() : ''
      const pathSegment = toSinglePathFilename(
        rawDisplay || buildPdfRenderContentDispositionBasename(template),
        buildPdfRenderContentDispositionBasename(template),
        '.pdf',
      )
      const token = issuePdfPreviewPdf(Buffer.from(rendered), {
        pathSegment,
        userId: req.user?.id ? String(req.user.id) : null,
      })
      res.json({
        previewUrl: `/api/pdf-render-previews/${token}/${encodeURIComponent(pathSegment)}`,
        downloadFilename: pathSegment,
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'httpStatus' in error && error.httpStatus === 400) {
        res.status(400).json({ message: error instanceof Error ? error.message : '요청이 올바르지 않습니다.' })
        return
      }
      console.error('[pdf-templates] render-preview 실패', error)
      const msg = error instanceof Error ? error.message : 'PDF 생성에 실패했습니다.'
      res.status(500).json({ message: msg })
    }
  })

  apiRouter.get('/pdf-render-previews/:token/:filename', async (req, res) => {
    try {
      const token = String(req.params.token ?? '').trim()
      let decoded
      try {
        decoded = decodeURIComponent(String(req.params.filename ?? '').trim())
      } catch {
        res.status(400).send('Bad Request')
        return
      }
      const entry = getPdfPreviewEntry(token)
      if (!entry) {
        res.status(410).json({ message: '만료되었거나 유효하지 않은 미리보기입니다.' })
        return
      }
      if (decoded !== entry.pathSegment) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', buildInlinePdfContentDisposition(entry.pathSegment))
      res.setHeader('Content-Length', String(entry.buffer.length))
      res.setHeader('Cache-Control', 'private, max-age=300')
      res.end(entry.buffer)
    } catch (error) {
      handleDbError(res, error)
    }
  })

  // ─── 발급 이력 라우트 ──────────────────────────────────────────────

  /*
   * 사용자/관리자 공용: 본인 이력 또는(관리자) 전체 이력.
   *
   * 스코핑:
   *   - SUPER_ADMIN: 전체 조회(listIssuancesAll).
   *   - 그 외: req.user.id 로 제한. userId 가 없으면 빈 배열.
   * 응답 구조는 프론트 표 렌더링에 바로 쓸 수 있는 DTO 로 변환한다.
   */
  apiRouter.get('/pdf-issuances', requireAuth, async (req, res) => {
    try {
      const isSuper = isSuperAdminRole(req.user?.role)
      const rows = isSuper
        ? await listIssuancesAll(pool, { limit: 200 })
        : req.user?.id
          ? await listIssuancesByUser(pool, String(req.user.id), { limit: 200 })
          : []
      res.json({
        issuances: rows.map((row) => ({
          id: row.id,
          templateId: row.template_id,
          userId: row.user_id,
          gaId: row.ga_id,
          templateCode: row.template_code,
          templateTitle: row.template_title,
          byteLength: row.byte_length,
          createdAt: row.created_at,
        })),
      })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  /*
   * 발급 단건 메타 + 입력값 스냅샷 — "내용 불러오기"(재편집 후 재발급) 용도.
   * 다운로드(`/file`) 와 같은 소유 규칙: SUPER_ADMIN 또는 user_id 일치만 valuesSnapshot 노출.
   */
  function issuanceValuesSnapshotToDto(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {}
    }
    const out = {}
    for (const [k, v] of Object.entries(raw)) {
      const key = String(k)
      if (v == null) {
        out[key] = ''
      } else if (typeof v === 'string') {
        out[key] = v
      } else if (typeof v === 'number' || typeof v === 'boolean') {
        out[key] = String(v)
      } else {
        out[key] = JSON.stringify(v)
      }
    }
    return out
  }

  apiRouter.get('/pdf-issuances/:id', requireAuth, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const row = await getIssuanceById(pool, id)
      if (!row) {
        res.status(404).json({ message: '이력을 찾을 수 없습니다.' })
        return
      }
      const isSuper = isSuperAdminRole(req.user?.role)
      const isOwner = row.user_id != null && row.user_id === String(req.user?.id ?? '')
      if (!isSuper && !isOwner) {
        res.status(404).json({ message: '이력을 찾을 수 없습니다.' })
        return
      }
      res.json({
        issuance: {
          id: row.id,
          templateId: row.template_id,
          templateCode: row.template_code,
          templateTitle: row.template_title,
          gaId: row.ga_id,
          userId: row.user_id,
          createdAt: row.created_at,
          valuesSnapshot: issuanceValuesSnapshotToDto(row.values_snapshot),
        },
      })
    } catch (error) {
      handleDbError(res, error)
    }
  })

  /*
   * 보관된 PDF 재다운로드.
   *
   * 접근 규칙:
   *   - SUPER_ADMIN: 모두 허용.
   *   - 본인 이력: user_id 가 일치해야 허용.
   *   그 외는 404 로 응답(이력 존재 여부 노출 방지).
   */
  apiRouter.get('/pdf-issuances/:id/file', requireAuth, async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: 'id 가 올바르지 않습니다.' })
      return
    }
    try {
      const row = await getIssuanceById(pool, id)
      if (!row) {
        res.status(404).json({ message: '이력을 찾을 수 없습니다.' })
        return
      }
      const isSuper = isSuperAdminRole(req.user?.role)
      const isOwner = row.user_id != null && row.user_id === String(req.user?.id ?? '')
      if (!isSuper && !isOwner) {
        res.status(404).json({ message: '이력을 찾을 수 없습니다.' })
        return
      }
      const buf = await getIssuanceObject(row.storage_key)
      if (!buf || buf.length === 0) {
        res.status(502).json({
          message: '보관된 PDF 가 비어 있습니다.',
          code: 'issuance-empty-object',
        })
        return
      }
      const filename = encodeURIComponent(`${row.template_code}-${row.id}.pdf`)
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Length', String(buf.length))
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="issuance.pdf"; filename*=UTF-8''${filename}`,
      )
      res.setHeader('Cache-Control', 'private, no-store')
      res.send(buf)
    } catch (error) {
      console.error('[pdf-issuances] 다운로드 실패', { id, error })
      res.status(502).json({
        message: '이력 PDF 를 가져오지 못했습니다.',
        code: 'issuance-fetch-failed',
      })
    }
  })
}
