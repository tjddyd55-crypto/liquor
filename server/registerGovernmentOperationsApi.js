/**
 * government-support 운영 API — 공지/자료실 (유저 사업장 데이터와 분리).
 */
import {
  consentGetBuffer,
  consentGetSignedDownloadUrl,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2GetPresignedPutUrl,
  getR2InsurerAttachmentsCacheControl,
} from './lib/consentStorage.js'
import { createGovernmentSupportGuards } from './lib/governmentSupport/governmentAccess.js'
import {
  GOVERNMENT_RESOURCE_ALLOWED_MIME,
  GOVERNMENT_RESOURCE_MAX_BYTES,
} from './lib/governmentSupport/governmentOperationsConstants.js'
import { canManageGovernmentOperations } from './lib/governmentSupport/governmentOperationsAccess.js'
import {
  archiveGovernmentNotice,
  createGovernmentNotice,
  getGovernmentNotice,
  listGovernmentNotices,
  updateGovernmentNotice,
} from './lib/governmentSupport/governmentNotices.js'
import {
  archiveGovernmentResource,
  createGovernmentResource,
  createGovernmentResourceDraftRow,
  getGovernmentResource,
  listGovernmentResources,
  updateGovernmentResource,
} from './lib/governmentSupport/governmentResources.js'
import {
  assertGovernmentResourceObjectKey,
  buildGovernmentResourceObjectKey,
} from './lib/governmentSupport/governmentResourceStorage.js'

/**
 * @param {import('express').Router} router
 * @param {{ pool: import('pg').Pool, requireAuth: Function, handleDbError: Function }} deps
 */
export function registerGovernmentOperationsApi(router, deps) {
  const { pool, requireAuth, handleDbError } = deps
  const { requireGovernmentMember, attach } = createGovernmentSupportGuards(pool, {
    requireAuth,
    handleDbError,
  })

  const requireOperationsManager = [
    requireAuth,
    attach,
    (req, res, next) => {
      try {
        const ctx = req.platformContext
        if (!ctx || !canManageGovernmentOperations(ctx)) {
          res.status(403).json({ message: '운영 기능 권한이 필요합니다.' })
          return
        }
        next()
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  ]

  router.get('/government-support/notices', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const result = await listGovernmentNotices(pool, ctx, req.query ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/notices/:id', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const managerView = canManageGovernmentOperations(ctx) && req.query.managerView === 'true'
      const result = await getGovernmentNotice(pool, ctx, req.params.id, { managerView })
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/admin/notices', ...requireOperationsManager, async (req, res) => {
    try {
      const result = await createGovernmentNotice(pool, req.platformContext, req.body ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.status(201).json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/admin/notices/:id', ...requireOperationsManager, async (req, res) => {
    try {
      const result = await updateGovernmentNotice(pool, req.platformContext, req.params.id, req.body ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.delete('/government-support/admin/notices/:id', ...requireOperationsManager, async (req, res) => {
    try {
      const result = await archiveGovernmentNotice(pool, req.platformContext, req.params.id)
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, message: result.message })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/resources', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const result = await listGovernmentResources(pool, ctx, req.query ?? {})
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/resources/:id', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const managerView = canManageGovernmentOperations(ctx) && req.query.managerView === 'true'
      const result = await getGovernmentResource(pool, ctx, req.params.id, { managerView })
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.get('/government-support/resources/:id/download', ...requireGovernmentMember, async (req, res) => {
    try {
      const ctx = req.platformContext
      const result = await getGovernmentResource(pool, ctx, req.params.id, { managerView: false })
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      const row = result.data
      if (!row.fileKey) {
        res.status(404).json({ message: '파일이 없습니다.' })
        return
      }
      const signed = await consentGetSignedDownloadUrl(row.fileKey, 900)
      if (signed) {
        res.json({ success: true, data: { downloadUrl: signed, fileName: row.fileName } })
        return
      }
      const buf = await consentGetBuffer(row.fileKey)
      if (!buf) {
        res.status(404).json({ message: '파일을 찾을 수 없습니다.' })
        return
      }
      res.setHeader('Content-Type', row.mimeType || 'application/octet-stream')
      res.setHeader(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(row.fileName || 'download')}`,
      )
      res.send(buf)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/admin/resources/presign', ...requireOperationsManager, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const body = req.body ?? {}
      const fileName = String(body.fileName ?? body.file_name ?? 'file').trim() || 'file'
      const contentType = String(body.contentType ?? body.mimeType ?? 'application/octet-stream').trim()
      const sizeBytes = Number(body.sizeBytes ?? body.fileSize ?? 0)
      if (!GOVERNMENT_RESOURCE_ALLOWED_MIME.has(contentType)) {
        res.status(400).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > GOVERNMENT_RESOURCE_MAX_BYTES) {
        res.status(400).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }
      const ctx = req.platformContext
      let resourceId = body.resourceId ?? body.resource_id ?? null
      let tenantId = body.tenantId ?? body.tenant_id ?? null
      let scopeType = body.scopeType ?? body.scope_type ?? 'agency'
      if (!resourceId) {
        const draft = await createGovernmentResourceDraftRow(pool, ctx, body)
        if (!draft.ok) {
          res.status(draft.status).json({ message: draft.message })
          return
        }
        resourceId = draft.data.id
        tenantId = draft.data.tenant_id
        scopeType = draft.data.scope_type
      }
      const objectKey = buildGovernmentResourceObjectKey({
        tenantId,
        resourceId,
        fileName,
        scopeType,
      })
      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
      if (!uploadUrl) {
        res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
        return
      }
      const putHeaders = cacheControl ? { 'Cache-Control': cacheControl } : {}
      res.json({
        success: true,
        data: {
          uploadUrl,
          objectKey,
          putHeaders,
          resourceId: String(resourceId),
        },
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.post('/government-support/admin/resources', ...requireOperationsManager, async (req, res) => {
    try {
      const body = req.body ?? {}
      const ctx = req.platformContext
      const resourceId = body.resourceId ?? body.resource_id
      if (resourceId) {
        const fileKey = body.fileKey ?? body.file_key
        if (fileKey) {
          const ex = await getGovernmentResource(pool, ctx, String(resourceId), { managerView: true })
          if (!ex.ok) {
            res.status(ex.status).json({ message: ex.message })
            return
          }
          if (
            !assertGovernmentResourceObjectKey(String(fileKey), {
              tenantId: ex.data.tenantId,
              resourceId: String(resourceId),
              scopeType: ex.data.scopeType,
            })
          ) {
            res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
            return
          }
        }
        const result = await updateGovernmentResource(pool, ctx, String(resourceId), body)
        if (!result.ok) {
          res.status(result.status).json({ message: result.message })
          return
        }
        res.json({ success: true, data: result.data })
        return
      }
      const fileKey = String(body.fileKey ?? body.file_key ?? '').trim()
      if (fileKey) {
        const draft = await createGovernmentResourceDraftRow(pool, ctx, body)
        if (!draft.ok) {
          res.status(draft.status).json({ message: draft.message })
          return
        }
        const rid = String(draft.data.id)
        if (
          !assertGovernmentResourceObjectKey(fileKey, {
            tenantId: draft.data.tenant_id,
            resourceId: rid,
            scopeType: draft.data.scope_type,
          })
        ) {
          res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
          return
        }
        const result = await updateGovernmentResource(pool, ctx, rid, { ...body, fileKey })
        if (!result.ok) {
          res.status(result.status).json({ message: result.message })
          return
        }
        res.status(201).json({ success: true, data: result.data })
        return
      }
      const result = await createGovernmentResource(pool, ctx, body)
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.status(201).json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.patch('/government-support/admin/resources/:id', ...requireOperationsManager, async (req, res) => {
    try {
      const body = req.body ?? {}
      const fileKey = body.fileKey ?? body.file_key
      if (fileKey) {
        const ex = await getGovernmentResource(pool, req.platformContext, req.params.id, {
          managerView: true,
        })
        if (!ex.ok) {
          res.status(ex.status).json({ message: ex.message })
          return
        }
        if (
          !assertGovernmentResourceObjectKey(String(fileKey), {
            tenantId: ex.data.tenantId,
            resourceId: req.params.id,
            scopeType: ex.data.scopeType,
          })
        ) {
          res.status(400).json({ message: '허용되지 않은 저장 경로입니다.' })
          return
        }
      }
      const result = await updateGovernmentResource(pool, req.platformContext, req.params.id, body)
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: result.data })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  router.delete('/government-support/admin/resources/:id', ...requireOperationsManager, async (req, res) => {
    try {
      const result = await archiveGovernmentResource(pool, req.platformContext, req.params.id)
      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, message: result.message })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })
}
