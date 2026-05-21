import { randomUUID } from 'node:crypto'
import jwt from 'jsonwebtoken'
import { safeQuery } from './utils/dbSafeQuery.js'
import {
  consentGetBuffer,
  consentGetSignedDownloadUrl,
  consentPutObject,
  isConsentR2Enabled,
  r2DeleteStorageObjectOrThrow,
} from './lib/consentStorage.js'

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024
const SIGNATURE_ACTIVE = 'active'
const SIGNATURE_REPLACED = 'replaced'
const ALLOWED_SIGNER_TYPES = new Set(['USER', 'CUSTOMER'])

function normalizeOptionalText(value, max = 120) {
  if (value == null) {
    return null
  }
  const t = String(value).trim()
  if (!t) {
    return null
  }
  return t.slice(0, max)
}

function parseOptionalCustomerId(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

function parseSignatureDataUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return null
  }
  const trimmed = input.trim()
  const marker = 'base64,'
  const index = trimmed.indexOf(marker)
  if (!trimmed.startsWith('data:image/png') || index < 0) {
    return null
  }
  try {
    const buf = Buffer.from(trimmed.slice(index + marker.length), 'base64')
    if (!buf || buf.length < 32) {
      return null
    }
    return buf
  } catch {
    return null
  }
}

function signSignatureFileJwt(key, JWT_SECRET) {
  return jwt.sign({ scope: 'signature-file', key }, JWT_SECRET, { expiresIn: '15m' })
}

function verifySignatureFileJwt(token, JWT_SECRET) {
  const payload = jwt.verify(token, JWT_SECRET)
  if (payload.scope !== 'signature-file' || typeof payload.key !== 'string') {
    throw new Error('invalid payload')
  }
  return { key: payload.key }
}

function buildSignatureFileUrl(req, jwtToken) {
  const prefix = req.baseUrl?.startsWith('/backend') ? '/backend' : '/api'
  return `${prefix}/signatures/file?token=${encodeURIComponent(jwtToken)}`
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.parseGaId
 * @param {Function} ctx.handleDbError
 * @param {string} ctx.JWT_SECRET
 */
export function registerSignatureApi(apiRouter, ctx) {
  const { pool, requireAuth, parseGaId, handleDbError, JWT_SECRET } = ctx

  apiRouter.post('/signatures', requireAuth, async (req, res) => {
    const userId = String(req.user?.id ?? '').trim()
    if (!userId) {
      res.status(401).json({ message: '로그인이 필요합니다.' })
      return
    }
    const gaId = parseGaId(req.user?.gaId)
    if (gaId == null) {
      res.status(400).json({ message: 'GA 컨텍스트를 확인할 수 없습니다.' })
      return
    }

    const signerTypeRaw = String(req.body?.signerType ?? 'USER').trim().toUpperCase()
    const signerType = ALLOWED_SIGNER_TYPES.has(signerTypeRaw) ? signerTypeRaw : null
    if (!signerType) {
      res.status(400).json({ message: 'signerType이 올바르지 않습니다.' })
      return
    }
    const signerId = String(req.body?.signerId ?? '').trim()
    if (!signerId) {
      res.status(400).json({ message: 'signerId가 필요합니다.' })
      return
    }
    if (signerType === 'USER' && signerId !== userId) {
      res.status(403).json({ message: '다른 사용자 서명으로 저장할 수 없습니다.' })
      return
    }

    const relatedType = normalizeOptionalText(req.body?.relatedType, 50)
    const relatedId = normalizeOptionalText(req.body?.relatedId, 120)
    const customerId = parseOptionalCustomerId(req.body?.customerId)
    const replaceSignatureId = normalizeOptionalText(req.body?.replaceSignatureId, 80)

    const signatureBuffer = parseSignatureDataUrl(req.body?.signatureDataUrl)
    if (!signatureBuffer) {
      res.status(400).json({ message: '유효한 PNG 서명 데이터가 필요합니다.' })
      return
    }
    if (signatureBuffer.length > MAX_SIGNATURE_BYTES) {
      res.status(400).json({ message: '서명 이미지 용량이 너무 큽니다.' })
      return
    }

    const signatureId = randomUUID()
    const customerPath = customerId != null ? String(customerId) : 'temp'
    const fileKey = `signatures/${gaId}/${customerPath}/${signatureId}.png`

    try {
      await consentPutObject(fileKey, signatureBuffer, 'image/png')
    } catch (error) {
      handleDbError(error, req, res)
      return
    }

    const client = await pool.connect()
    const replacedFileKeys = []
    try {
      await client.query('BEGIN')

      const existingActive = await safeQuery(
        client,
        `
        SELECT id, file_key
        FROM signature
        WHERE ga_id = $1
          AND signer_type = $2
          AND signer_id = $3
          AND customer_id IS NOT DISTINCT FROM $4
          AND related_type IS NOT DISTINCT FROM $5
          AND related_id IS NOT DISTINCT FROM $6
          AND status = $7
        FOR UPDATE
        `,
        [gaId, signerType, signerId, customerId, relatedType, relatedId, SIGNATURE_ACTIVE],
        { allowUnscoped: true },
      )

      for (const row of existingActive.rows) {
        if (replaceSignatureId && String(row.id) === replaceSignatureId) {
          replacedFileKeys.push(String(row.file_key ?? ''))
          continue
        }
        replacedFileKeys.push(String(row.file_key ?? ''))
      }

      if (replaceSignatureId) {
        await safeQuery(
          client,
          `
          UPDATE signature
          SET status = $1
          WHERE ga_id = $2
            AND id = $3
            AND signer_type = $4
            AND signer_id = $5
            AND customer_id IS NOT DISTINCT FROM $6
            AND related_type IS NOT DISTINCT FROM $7
            AND related_id IS NOT DISTINCT FROM $8
            AND status = $9
          `,
          [
            SIGNATURE_REPLACED,
            gaId,
            replaceSignatureId,
            signerType,
            signerId,
            customerId,
            relatedType,
            relatedId,
            SIGNATURE_ACTIVE,
          ],
          { allowUnscoped: true },
        )
      }

      await safeQuery(
        client,
        `
        UPDATE signature
        SET status = $1
        WHERE ga_id = $2
          AND signer_type = $3
          AND signer_id = $4
          AND customer_id IS NOT DISTINCT FROM $5
          AND related_type IS NOT DISTINCT FROM $6
          AND related_id IS NOT DISTINCT FROM $7
          AND status = $8
        `,
        [SIGNATURE_REPLACED, gaId, signerType, signerId, customerId, relatedType, relatedId, SIGNATURE_ACTIVE],
        { allowUnscoped: true },
      )

      await safeQuery(
        client,
        `
        INSERT INTO signature (
          id, ga_id, customer_id, signer_type, signer_id, related_type, related_id,
          file_key, created_by, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `,
        [
          signatureId,
          gaId,
          customerId,
          signerType,
          signerId,
          relatedType,
          relatedId,
          fileKey,
          userId,
          SIGNATURE_ACTIVE,
        ],
        { allowUnscoped: true },
      )

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      try {
        await r2DeleteStorageObjectOrThrow(fileKey)
      } catch {
        // 롤백 중 파일 삭제 실패는 서버 로그로만 남기고 응답은 원인 오류를 우선한다.
      }
      handleDbError(error, req, res)
      return
    } finally {
      client.release()
    }

    for (const key of replacedFileKeys) {
      const target = String(key ?? '').trim()
      if (!target || target === fileKey) {
        continue
      }
      try {
        await r2DeleteStorageObjectOrThrow(target)
      } catch (error) {
        console.warn('[signature] replaced file cleanup failed', { key: target, error })
      }
    }

    let previewUrl = ''
    if (isConsentR2Enabled()) {
      const signed = await consentGetSignedDownloadUrl(fileKey, 3600)
      previewUrl = signed ?? ''
    }
    if (!previewUrl) {
      const token = signSignatureFileJwt(fileKey, JWT_SECRET)
      previewUrl = buildSignatureFileUrl(req, token)
    }

    res.status(201).json({
      id: signatureId,
      gaId,
      customerId,
      signerType,
      signerId,
      relatedType,
      relatedId,
      fileKey,
      status: SIGNATURE_ACTIVE,
      previewUrl,
    })
  })

  apiRouter.get('/signatures/file', async (req, res) => {
    try {
      const token = String(req.query.token ?? '').trim()
      if (!token) {
        res.status(400).send('token이 필요합니다.')
        return
      }
      const { key } = verifySignatureFileJwt(token, JWT_SECRET)
      const buf = await consentGetBuffer(key)
      res.setHeader('Content-Type', 'image/png')
      res.setHeader('Cache-Control', 'private, max-age=120')
      res.send(buf)
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[signatures/file]', error)
      }
      res.status(401).send('서명 이미지 링크가 만료되었거나 유효하지 않습니다.')
    }
  })
}
