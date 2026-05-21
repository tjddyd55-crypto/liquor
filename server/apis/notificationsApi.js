import { safeQuery } from '../utils/dbSafeQuery.js'
import { parseGaId } from '../lib/parseGaId.js'
import { deleteCustomerNewsletterHard } from '../services/customerNewsDeleteService.js'

function isInsurerManagerRole(role) {
  const normalized = String(role ?? '')
  return normalized === 'INSURER_MANAGER' || normalized === 'LOSS_ADJUSTER'
}

function requireGaForNotifications(req, res) {
  if (isInsurerManagerRole(req.user?.role)) {
    res.status(403).json({ message: '알림을 사용할 수 없는 계정입니다.' })
    return null
  }
  const gaId = parseGaId(req.user?.gaId)
  if (gaId == null) {
    res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
    return null
  }
  return gaId
}

const NOTIFICATIONS_LIST_LIMIT_DEFAULT = 20
const NOTIFICATIONS_LIST_LIMIT_MAX = 50

function parsePositiveIntLocal(value) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.handleDbError
 */
export function registerNotificationsApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx

  apiRouter.get('/notifications/unread-count', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaForNotifications(req, res)
      if (gaId == null) {
        return
      }
      const r = await safeQuery(
        pool,
        `
        SELECT COUNT(*)::bigint AS c
        FROM notifications
        WHERE user_id = $1 AND ga_id = $2 AND is_read = false
        `,
        [userId, gaId],
      )
      const row = r.rows[0]
      const count = row && row.c != null ? Number(row.c) : 0
      res.json({ count: Number.isFinite(count) ? count : 0 })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/notifications', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaForNotifications(req, res)
      if (gaId == null) {
        return
      }
      const limRaw = Number(req.query?.limit ?? NOTIFICATIONS_LIST_LIMIT_DEFAULT)
      const limit = Math.min(
        NOTIFICATIONS_LIST_LIMIT_MAX,
        Math.max(1, Number.isFinite(limRaw) ? Math.floor(limRaw) : NOTIFICATIONS_LIST_LIMIT_DEFAULT),
      )
      const r = await safeQuery(
        pool,
        `
        SELECT id, user_id, ga_id, team_id, type, reference_id, message, is_read, created_at
        FROM notifications
        WHERE user_id = $1 AND ga_id = $2
        ORDER BY created_at DESC
        LIMIT $3
        `,
        [userId, gaId, limit],
      )
      res.json({
        notifications: r.rows.map((row) => ({
          id: String(row.id),
          userId: String(row.user_id ?? ''),
          gaId: Number(row.ga_id),
          teamId: row.team_id != null ? String(row.team_id) : null,
          type: String(row.type ?? ''),
          referenceId: row.reference_id != null ? String(row.reference_id) : null,
          message: String(row.message ?? ''),
          isRead: Boolean(row.is_read),
          createdAt: row.created_at,
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/notifications/:notificationId/read', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaForNotifications(req, res)
      if (gaId == null) {
        return
      }
      const nid = String(req.params.notificationId ?? '').trim()
      if (!nid || !/^\d+$/.test(nid)) {
        res.status(400).json({ message: '알림을 찾을 수 없습니다.' })
        return
      }
      const upd = await safeQuery(
        pool,
        `
        UPDATE notifications
        SET is_read = true
        WHERE id = $1::bigint AND user_id = $2 AND ga_id = $3
        `,
        [nid, userId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '알림을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/agent/customer-news/:newsId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const newsId = String(req.params.newsId ?? '').trim()
      if (!newsId || newsId.length > 128) {
        res.status(400).json({ message: '삭제할 소식지를 찾을 수 없습니다.' })
        return
      }
      const targetCustomerId = parsePositiveIntLocal(req.query?.targetCustomerId)

      const result = await deleteCustomerNewsletterHard(pool, {
        actorUserId: userId,
        actorRole: req.user?.role,
        gaId,
        newsId,
        targetCustomerId,
      })

      if (!result.ok) {
        res.status(result.status).json({ message: result.message })
        return
      }
      res.json({ success: true, data: { id: result.deletedId } })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })
}
