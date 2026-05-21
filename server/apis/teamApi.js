import { randomUUID } from 'node:crypto'
import { safeQuery } from '../utils/dbSafeQuery.js'
import { parseGaId } from '../lib/parseGaId.js'
import {
  getR2InsurerAttachmentsCacheControl,
  getR2PublicCdnBase,
  isConsentR2Enabled,
  logR2EnvDiagnosticCheck,
  r2DeleteStorageObjectOrThrow,
  r2GetPresignedPutUrl,
} from '../lib/consentStorage.js'

function isInsurerManagerRole(role) {
  const normalized = String(role ?? '')
  return normalized === 'INSURER_MANAGER' || normalized === 'LOSS_ADJUSTER'
}

/** SUPER_ADMIN / GA_ADMIN — 팀 게시글 수정·삭제 시 작성자·팀장 외 예외 허용 */
function isTeamPostElevatedRole(role) {
  const r = String(role ?? '')
  return r === 'SUPER_ADMIN' || r === 'GA_ADMIN'
}

function requireGaTenantForTeam(req, res) {
  if (isInsurerManagerRole(req.user?.role)) {
    res.status(403).json({ message: '팀 기능을 사용할 수 없는 계정입니다.' })
    return null
  }
  const gaId = parseGaId(req.user?.gaId)
  if (gaId == null) {
    res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
    return null
  }
  return gaId
}

/**
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
async function loadUserTeamContext(pool, userId) {
  const r = await safeQuery(
    pool,
    `
    SELECT u.team_id, u.ga_id
    FROM users u
    WHERE u.id = $1 AND u.is_deleted = false
    LIMIT 1
    `,
    [userId],
  )
  if (r.rowCount === 0) {
    return null
  }
  const row = r.rows[0]
  return {
    teamId: row.team_id != null ? String(row.team_id) : null,
    gaId: row.ga_id != null ? Number(row.ga_id) : null,
  }
}

const TEAM_NAME_MAX = 120
const TEAM_POST_TITLE_MAX = 200
const TEAM_POST_CONTENT_MAX = 50000
const TEAM_POST_ATTACH_MAX = 10
const TEAM_POST_ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
])

const TEAM_POSTS_PAGE_DEFAULT = 20
const TEAM_POSTS_PAGE_MAX = 50
const TEAM_COMMENT_MAX = 8000

/**
 * @param {import('express').Request} req
 */
function parseTeamPostsPagination(req) {
  const limitRaw = Number(req.query?.limit ?? TEAM_POSTS_PAGE_DEFAULT)
  const pageRaw = Number(req.query?.page ?? 1)
  const limit = Math.min(
    TEAM_POSTS_PAGE_MAX,
    Math.max(1, Number.isFinite(limitRaw) ? Math.floor(limitRaw) : TEAM_POSTS_PAGE_DEFAULT),
  )
  const page = Math.max(1, Number.isFinite(pageRaw) ? Math.floor(pageRaw) : 1)
  return { limit, page, offset: (page - 1) * limit }
}

/**
 * @param {{ query: Function }} executor
 * @param {{ teamId: string, gaId: number, authorUserId: string, postId: string, title: string }} p
 */
async function notifyTeamMembersNewPost(executor, p) {
  const members = await safeQuery(
    executor,
    `
    SELECT id FROM users
    WHERE team_id = $1 AND ga_id = $2 AND is_deleted = false AND id <> $3
    `,
    [p.teamId, p.gaId, p.authorUserId],
  )
  const msg = `새 팀 게시글: ${String(p.title ?? '').slice(0, 120)}`
  for (const row of members.rows) {
    await safeQuery(
      executor,
      `
      INSERT INTO notifications (user_id, ga_id, team_id, type, reference_id, message)
      VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [String(row.id), p.gaId, p.teamId, 'TEAM_POST_NEW', p.postId, msg],
    )
  }
}

/**
 * @param {{ query: Function }} executor
 */
async function notifyPostAuthorNewComment(executor, args) {
  const { gaId, teamId, postId, postAuthorId, actorUserId } = args
  if (!postAuthorId || String(postAuthorId) === String(actorUserId)) {
    return
  }
  const actorLabelRes = await safeQuery(
    executor,
    `
    SELECT COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(username), ''), '') AS label
    FROM users
    WHERE id = $1 AND ga_id = $2 AND is_deleted = false
    LIMIT 1
    `,
    [String(actorUserId), gaId],
  )
  const raw =
    actorLabelRes.rowCount > 0 ? String(actorLabelRes.rows[0].label ?? '').trim() : ''
  const who = raw || '사용자'
  const message = `${who}님이 댓글을 남겼습니다`
  await safeQuery(
    executor,
    `
    INSERT INTO notifications (user_id, ga_id, team_id, type, reference_id, message)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [String(postAuthorId), gaId, teamId, 'comment', postId, message],
  )
}

/** @param {string} contentType */
function teamPostMaxBytesForMime(contentType) {
  if (contentType === 'application/pdf') {
    return 10 * 1024 * 1024
  }
  return 10 * 1024 * 1024
}

/**
 * @param {string} objectKey
 * @param {number} gaId
 * @param {string} teamId
 */
function assertTeamPostAttachmentKey(objectKey, gaId, teamId) {
  const prefix = `teams/${gaId}/${teamId}/attachments/`
  const k = String(objectKey ?? '').trim()
  return k.startsWith(prefix) && k.length > prefix.length + 4
}

/** team_post_attachments.file_url → R2 object key */
function teamAttachmentObjectKeyFromFileUrl(fileUrl) {
  const base = getR2PublicCdnBase().replace(/\/$/, '')
  const u = String(fileUrl ?? '').trim()
  if (!u) {
    return ''
  }
  if (u.startsWith(`${base}/`)) {
    return u.slice(base.length + 1)
  }
  if (u.startsWith(base)) {
    return u.slice(base.length).replace(/^\//, '')
  }
  return ''
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {string} teamId
 * @param {number} gaId
 */
async function loadTeamRowForApi(executor, teamId, gaId) {
  const r = await safeQuery(
    executor,
    `
    SELECT id, ga_id, owner_user_id, COALESCE(is_active, true) AS is_active
    FROM teams
    WHERE id = $1
    LIMIT 1
    `,
    [teamId],
  )
  if (r.rowCount === 0) {
    return null
  }
  const row = r.rows[0]
  const g = Number(row.ga_id)
  if (!Number.isFinite(g) || g !== gaId) {
    return null
  }
  return {
    id: String(row.id),
    ownerUserId: row.owner_user_id != null ? String(row.owner_user_id) : null,
    isActive: Boolean(row.is_active),
  }
}

/**
 * 팀장을 제외한 활성 팀원 수 (users.team_id 기준 — team_members 테이블 없음)
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 */
async function countActiveTeamMembersOtherThan(executor, teamId, gaId, excludeUserId) {
  const r = await safeQuery(
    executor,
    `
    SELECT COUNT(*)::int AS n
    FROM users
    WHERE team_id = $1
      AND ga_id = $2
      AND is_deleted = false
      AND id <> $3
    `,
    [teamId, gaId, excludeUserId],
  )
  return r.rowCount > 0 ? Number(r.rows[0].n ?? 0) : 0
}

/**
 * 팀 해체: R2 객체 선삭제 후 DB를 단일 트랜잭션으로 정리. teams 행은 유지·비활성.
 * @param {import('pg').Pool} pool
 */
async function disbandTeamFull(pool, gaId, teamId, leaderUserId) {
  const team = await loadTeamRowForApi(pool, teamId, gaId)
  if (!team || !team.isActive) {
    const e = new Error('TEAM_NOT_FOUND')
    throw e
  }
  if (!team.ownerUserId || team.ownerUserId !== leaderUserId) {
    const e = new Error('NOT_TEAM_LEADER')
    throw e
  }
  const others = await countActiveTeamMembersOtherThan(pool, teamId, gaId, leaderUserId)
  if (others > 0) {
    const e = new Error('TEAM_HAS_MEMBERS')
    throw e
  }

  const attRes = await safeQuery(
    pool,
    `
    SELECT a.file_url
    FROM team_post_attachments a
    INNER JOIN team_posts p ON p.id = a.post_id
    WHERE p.team_id = $1 AND p.ga_id = $2 AND COALESCE(p.is_deleted, false) = false
    `,
    [teamId, gaId],
  )
  const fileRes = await safeQuery(
    pool,
    `
    SELECT file_path
    FROM files
    WHERE team_id = $1 AND ga_id = $2 AND deleted_at IS NULL
    `,
    [teamId, gaId],
  )

  const keys = []
  for (const row of attRes.rows) {
    const k = teamAttachmentObjectKeyFromFileUrl(row.file_url)
    if (k) {
      keys.push(k)
    }
  }
  for (const row of fileRes.rows) {
    const k = String(row.file_path ?? '').trim()
    if (k) {
      keys.push(k)
    }
  }

  for (const key of keys) {
    await r2DeleteStorageObjectOrThrow(key)
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await safeQuery(
      client,
      `
      DELETE FROM team_post_attachments a
      USING team_posts p
      WHERE a.post_id = p.id AND p.team_id = $1 AND p.ga_id = $2
      `,
      [teamId, gaId],
    )
    await safeQuery(
      client,
      `
      UPDATE team_post_comments c
      SET is_deleted = true, deleted_at = NOW()
      FROM team_posts p
      WHERE c.post_id = p.id AND p.team_id = $1 AND p.ga_id = $2
        AND COALESCE(c.is_deleted, false) = false
      `,
      [teamId, gaId],
    )
    await safeQuery(
      client,
      `
      UPDATE team_posts
      SET is_deleted = true, deleted_at = NOW()
      WHERE team_id = $1 AND ga_id = $2 AND COALESCE(is_deleted, false) = false
      `,
      [teamId, gaId],
    )
    await safeQuery(
      client,
      `
      UPDATE files
      SET deleted_at = NOW()
      WHERE team_id = $1 AND ga_id = $2 AND deleted_at IS NULL
      `,
      [teamId, gaId],
    )
    await safeQuery(
      client,
      `
      UPDATE users
      SET team_id = NULL
      WHERE team_id = $1 AND ga_id = $2 AND is_deleted = false
      `,
      [teamId, gaId],
    )
    await safeQuery(
      client,
      `
      UPDATE teams
      SET is_active = false,
          storage_used = 0,
          owner_user_id = NULL
      WHERE id = $1 AND ga_id = $2
      `,
      [teamId, gaId],
    )
    await client.query('COMMIT')
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* ignore */
    }
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {import('express').Router} apiRouter
 * @param {object} ctx
 * @param {import('pg').Pool} ctx.pool
 * @param {Function} ctx.requireAuth
 * @param {Function} ctx.handleDbError
 */
export function registerTeamApi(apiRouter, ctx) {
  const { pool, requireAuth, handleDbError } = ctx

  apiRouter.post('/teams/create', requireAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }

      const ctxRow = await loadUserTeamContext(pool, userId)
      if (!ctxRow || ctxRow.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (ctxRow.teamId) {
        res.status(409).json({ message: '이미 팀에 소속되어 있습니다' })
        return
      }

      let name = String(req.body?.name ?? '').trim()
      if (!name) {
        name = '팀'
      }
      if (name.length > TEAM_NAME_MAX) {
        res.status(400).json({ message: `팀 이름은 ${TEAM_NAME_MAX}자 이하로 입력해 주세요.` })
        return
      }

      const teamId = randomUUID()
      await client.query('BEGIN')
      await client.query(
        `
        INSERT INTO teams (id, ga_id, name, owner_user_id)
        VALUES ($1, $2, $3, $4)
        `,
        [teamId, gaId, name, userId],
      )
      const upd = await client.query(
        `
        UPDATE users
        SET team_id = $1
        WHERE id = $2 AND ga_id = $3 AND is_deleted = false AND team_id IS NULL
        `,
        [teamId, userId, gaId],
      )
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(409).json({ message: '팀을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.' })
        return
      }
      await client.query('COMMIT')
      res.status(201).json({ teamId, name, gaId })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.post('/teams/join', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const teamIdRaw = req.body?.teamId ?? req.body?.team_id
      const teamId = String(teamIdRaw ?? '').trim()
      if (!teamId) {
        res.status(400).json({ message: '팀 ID를 입력해 주세요.' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `
        SELECT id, ga_id, name
        FROM teams
        WHERE id = $1 AND COALESCE(is_active, true) = true
        LIMIT 1
        `,
        [teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const team = teamRes.rows[0]
      const teamGaId = Number(team.ga_id)
      if (!Number.isFinite(teamGaId) || teamGaId !== gaId) {
        res.status(403).json({ message: '이 GA에서 참여할 수 없는 팀입니다.' })
        return
      }

      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (me.teamId === teamId) {
        res.json({ ok: true, teamId, name: String(team.name ?? ''), gaId })
        return
      }
      if (me.teamId) {
        res.status(409).json({ message: '이미 팀에 소속되어 있습니다' })
        return
      }

      const upd = await safeQuery(
        pool,
        `
        UPDATE users
        SET team_id = $1
        WHERE id = $2 AND ga_id = $3 AND is_deleted = false AND team_id IS NULL
        `,
        [teamId, userId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(409).json({ message: '팀 참여에 실패했습니다.' })
        return
      }
      res.json({ ok: true, teamId, name: String(team.name ?? ''), gaId })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/teams/members', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }

      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `
        SELECT id, name, ga_id, owner_user_id, COALESCE(is_active, true) AS is_active,
          COALESCE(storage_used, 0)::bigint AS storage_used,
          COALESCE(storage_limit, 0)::bigint AS storage_limit
        FROM teams
        WHERE id = $1
        LIMIT 1
        `,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(400).json({ message: '팀 정보를 찾을 수 없습니다. 소속을 다시 확인해 주세요.' })
        return
      }
      const teamRow = teamRes.rows[0]
      const resourceGaId = Number(teamRow.ga_id)
      if (!Number.isFinite(resourceGaId) || resourceGaId !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }

      const ownerId =
        teamRow.owner_user_id != null ? String(teamRow.owner_user_id) : null
      const teamActive = Boolean(teamRow.is_active)

      const members = await safeQuery(
        pool,
        `
        SELECT id, username, display_name, role, team_id
        FROM users
        WHERE team_id = $1 AND ga_id = $2 AND is_deleted = false
        ORDER BY display_name ASC NULLS LAST, username ASC
        `,
        [me.teamId, gaId],
      )
      res.json({
        teamId: String(teamRow.id),
        teamName: String(teamRow.name ?? ''),
        ownerId,
        teamActive,
        teamStorageUsedBytes: Number(teamRow.storage_used) || 0,
        teamStorageLimitBytes: Number(teamRow.storage_limit) || 0,
        members: members.rows.map((row) => ({
          userId: String(row.id),
          username: String(row.username ?? ''),
          displayName: String(row.display_name ?? ''),
          role: String(row.role ?? ''),
          teamId: row.team_id != null ? String(row.team_id) : null,
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/teams/kick', requireAuth, async (req, res) => {
    try {
      const actorId = req.user?.id ? String(req.user.id) : ''
      if (!actorId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const targetRaw = req.body?.userId ?? req.body?.user_id
      const targetUserId = String(targetRaw ?? '').trim()
      if (!targetUserId) {
        res.status(400).json({ message: '대상 사용자를 지정해 주세요.' })
        return
      }

      const me = await loadUserTeamContext(pool, actorId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `SELECT id, ga_id, owner_user_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(400).json({ message: '팀 정보를 찾을 수 없습니다. 소속을 다시 확인해 주세요.' })
        return
      }
      const team = teamRes.rows[0]
      const teamGaId = Number(team.ga_id)
      if (!Number.isFinite(teamGaId) || teamGaId !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }
      const ownerId = team.owner_user_id != null ? String(team.owner_user_id) : ''
      if (!ownerId || ownerId !== actorId) {
        res.status(403).json({ message: '팀장만 강퇴할 수 있습니다.' })
        return
      }
      if (targetUserId === actorId) {
        res.status(400).json({ message: '본인은 강퇴할 수 없습니다. 나가기를 이용해 주세요.' })
        return
      }
      if (targetUserId === ownerId) {
        res.status(400).json({ message: '팀장은 강퇴할 수 없습니다.' })
        return
      }

      const upd = await safeQuery(
        pool,
        `
        UPDATE users
        SET team_id = NULL
        WHERE id = $1 AND team_id = $2 AND ga_id = $3 AND is_deleted = false
        `,
        [targetUserId, me.teamId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '해당 팀원을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  const handleTeamLeave = async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }

      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRow = await loadTeamRowForApi(pool, me.teamId, gaId)
      if (!teamRow) {
        res.status(400).json({ message: '팀 정보를 찾을 수 없습니다. 소속을 다시 확인해 주세요.' })
        return
      }
      if (!teamRow.isActive) {
        res.status(400).json({ message: '이미 해체된 팀입니다.' })
        return
      }
      const ownerId = teamRow.ownerUserId != null ? String(teamRow.ownerUserId) : ''

      if (ownerId && ownerId === userId) {
        const otherMembers = await countActiveTeamMembersOtherThan(pool, me.teamId, gaId, userId)
        if (otherMembers > 0) {
          res.status(403).json({
            message: '팀장을 다른 팀원에게 위임해야 탈퇴할 수 있습니다',
          })
          return
        }
        try {
          await disbandTeamFull(pool, gaId, me.teamId, userId)
        } catch (e) {
          if (e instanceof Error && e.message === 'TEAM_HAS_MEMBERS') {
            res.status(403).json({
              message: '팀장을 다른 팀원에게 위임해야 탈퇴할 수 있습니다',
            })
            return
          }
          throw e
        }
        res.json({ ok: true, disbanded: true })
        return
      }

      const upd = await safeQuery(
        pool,
        `
        UPDATE users
        SET team_id = NULL
        WHERE id = $1 AND team_id = $2 AND ga_id = $3 AND is_deleted = false
        `,
        [userId, me.teamId, gaId],
      )
      if (upd.rowCount === 0) {
        res.status(409).json({ message: '팀 나가기에 실패했습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  }

  apiRouter.post('/teams/leave', requireAuth, handleTeamLeave)
  apiRouter.post('/team/leave', requireAuth, handleTeamLeave)

  const handleTransferLeader = async (req, res) => {
    const client = await pool.connect()
    try {
      const actorId = req.user?.id ? String(req.user.id) : ''
      if (!actorId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const targetRaw = req.body?.userId ?? req.body?.user_id
      const targetUserId = String(targetRaw ?? '').trim()
      if (!targetUserId) {
        res.status(400).json({ message: '새 팀장으로 지정할 사용자를 선택해 주세요.' })
        return
      }
      if (targetUserId === actorId) {
        res.status(400).json({ message: '이미 팀장입니다.' })
        return
      }

      const me = await loadUserTeamContext(pool, actorId)
      if (!me || me.gaId !== gaId || !me.teamId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }

      const teamRow = await loadTeamRowForApi(pool, me.teamId, gaId)
      if (!teamRow || !teamRow.isActive) {
        res.status(400).json({ message: '팀 정보를 찾을 수 없습니다.' })
        return
      }
      if (!teamRow.ownerUserId || teamRow.ownerUserId !== actorId) {
        res.status(403).json({ message: '팀장만 위임할 수 있습니다.' })
        return
      }

      await client.query('BEGIN')
      const upd = await safeQuery(
        client,
        `
        UPDATE teams t
        SET owner_user_id = $1
        FROM users u
        WHERE t.id = $2
          AND t.ga_id = $3
          AND COALESCE(t.is_active, true) = true
          AND t.owner_user_id = $4
          AND u.id = $1
          AND u.team_id = t.id
          AND u.ga_id = t.ga_id
          AND u.is_deleted = false
        `,
        [targetUserId, me.teamId, gaId, actorId],
      )
      if (upd.rowCount === 0) {
        await client.query('ROLLBACK')
        res.status(400).json({ message: '같은 팀에 속한 사용자만 팀장으로 지정할 수 있습니다.' })
        return
      }
      await client.query('COMMIT')
      res.json({ ok: true, ownerId: targetUserId })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  }

  apiRouter.post('/teams/transfer-leader', requireAuth, handleTransferLeader)
  apiRouter.post('/team/transfer-leader', requireAuth, handleTransferLeader)

  const handleDisbandTeam = async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }

      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRow = await loadTeamRowForApi(pool, me.teamId, gaId)
      if (!teamRow) {
        res.status(400).json({ message: '팀 정보를 찾을 수 없습니다. 소속을 다시 확인해 주세요.' })
        return
      }
      if (!teamRow.isActive) {
        res.status(400).json({ message: '이미 해체된 팀입니다.' })
        return
      }
      if (!teamRow.ownerUserId || teamRow.ownerUserId !== userId) {
        res.status(403).json({ message: '팀장만 팀을 해체할 수 있습니다.' })
        return
      }

      const otherMembers = await countActiveTeamMembersOtherThan(pool, me.teamId, gaId, userId)
      if (otherMembers > 0) {
        res.status(403).json({ message: '팀원이 없는 경우에만 팀 해체가 가능합니다' })
        return
      }

      await disbandTeamFull(pool, gaId, me.teamId, userId)
      res.json({ ok: true, disbanded: true })
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === 'TEAM_HAS_MEMBERS') {
          res.status(403).json({ message: '팀원이 없는 경우에만 팀 해체가 가능합니다' })
          return
        }
        if (e.message === 'NOT_TEAM_LEADER') {
          res.status(403).json({ message: '팀장만 팀을 해체할 수 있습니다.' })
          return
        }
        if (e.message === 'TEAM_NOT_FOUND') {
          res.status(400).json({ message: '팀 정보를 찾을 수 없습니다.' })
          return
        }
      }
      handleDbError(e, req, res)
    }
  }

  apiRouter.post('/teams/disband', requireAuth, handleDisbandTeam)
  apiRouter.post('/team/disband', requireAuth, handleDisbandTeam)

  apiRouter.get('/teams/files', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamCheck = await safeQuery(
        pool,
        `SELECT id, ga_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamCheck.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const tGa = Number(teamCheck.rows[0].ga_id)
      if (!Number.isFinite(tGa) || tGa !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }

      const r = await safeQuery(
        pool,
        `
        SELECT a.id, a.file_url, a.file_name, a.post_id, p.title AS post_title, p.created_at AS post_created_at
        FROM team_post_attachments a
        INNER JOIN team_posts p ON p.id = a.post_id
        WHERE p.team_id = $1 AND p.ga_id = $2 AND COALESCE(p.is_deleted, false) = false
        ORDER BY p.created_at DESC, a.id ASC
        `,
        [me.teamId, gaId],
      )
      res.json({
        teamId: me.teamId,
        files: r.rows.map((row) => ({
          id: String(row.id),
          fileUrl: String(row.file_url ?? ''),
          fileName: String(row.file_name ?? ''),
          postId: String(row.post_id ?? ''),
          postTitle: String(row.post_title ?? ''),
          postCreatedAt: row.post_created_at,
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/teams/posts', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `SELECT id, ga_id, owner_user_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const teamRow = teamRes.rows[0]
      const tGa = Number(teamRow.ga_id)
      if (!Number.isFinite(tGa) || tGa !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }
      const ownerId = teamRow.owner_user_id != null ? String(teamRow.owner_user_id) : null

      const { limit, page, offset } = parseTeamPostsPagination(req)
      const fetchLimit = limit + 1

      /* 향후 users 비활성·삭제 정책이 명확해지면 AND u.is_deleted = false 등 JOIN 조건 보강 검토 */
      const posts = await safeQuery(
        pool,
        `
        SELECT p.id, p.title, p.content, p.is_notice, p.created_at, p.author_user_id,
          u.username AS author_username, u.display_name AS author_display_name
        FROM team_posts p
        LEFT JOIN users u ON u.id = p.author_user_id AND u.ga_id = p.ga_id
        WHERE p.team_id = $1 AND p.ga_id = $2 AND COALESCE(p.is_deleted, false) = false
        ORDER BY p.is_notice DESC, p.created_at DESC
        LIMIT $3 OFFSET $4
        `,
        [me.teamId, gaId, fetchLimit, offset],
      )

      const hasNext = posts.rows.length > limit
      const pageRows = hasNext ? posts.rows.slice(0, limit) : posts.rows
      const postIds = pageRows.map((row) => String(row.id))
      /** @type {Map<string, Array<{ id: string, fileUrl: string, fileName: string }>>} */
      const attMap = new Map()
      if (postIds.length > 0) {
        const atts = await safeQuery(
          pool,
          `
          SELECT a.id, a.post_id, a.file_url, a.file_name
          FROM team_post_attachments a
          INNER JOIN team_posts p ON p.id = a.post_id
          WHERE a.post_id = ANY($1::text[])
            AND p.ga_id = $2
            AND p.team_id = $3
            AND COALESCE(p.is_deleted, false) = false
          ORDER BY a.id ASC
          `,
          [postIds, gaId, me.teamId],
        )
        for (const row of atts.rows) {
          const pid = String(row.post_id ?? '')
          if (!attMap.has(pid)) {
            attMap.set(pid, [])
          }
          attMap.get(pid).push({
            id: String(row.id),
            fileUrl: String(row.file_url ?? ''),
            fileName: String(row.file_name ?? ''),
          })
        }
      }

      res.json({
        teamId: me.teamId,
        ownerId,
        page,
        limit,
        hasNext,
        posts: pageRows.map((row) => {
          const pid = String(row.id)
          return {
            id: pid,
            title: String(row.title ?? ''),
            content: String(row.content ?? ''),
            isNotice: Boolean(row.is_notice),
            createdAt: row.created_at,
            authorId: String(row.author_user_id ?? ''),
            authorUsername: String(row.author_username ?? ''),
            authorDisplayName: String(row.author_display_name ?? ''),
            attachments: attMap.get(pid) ?? [],
          }
        }),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/teams/posts/:postId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const postId = String(req.params.postId ?? '').trim()
      if (!postId) {
        res.status(400).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const postRes = await safeQuery(
        pool,
        `
        SELECT p.id, p.team_id, p.title, p.content, p.is_notice, p.created_at, p.author_user_id,
          u.username AS author_username, u.display_name AS author_display_name
        FROM team_posts p
        LEFT JOIN users u ON u.id = p.author_user_id AND u.ga_id = p.ga_id
        WHERE p.id = $1 AND p.team_id = $2 AND p.ga_id = $3
          AND COALESCE(p.is_deleted, false) = false
        LIMIT 1
        `,
        [postId, me.teamId, gaId],
      )
      if (postRes.rowCount === 0) {
        res.status(404).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const row = postRes.rows[0]
      const atts = await safeQuery(
        pool,
        `
        SELECT a.id, a.file_url, a.file_name
        FROM team_post_attachments a
        INNER JOIN team_posts p ON p.id = a.post_id
        WHERE a.post_id = $1 AND p.ga_id = $2 AND p.team_id = $3
          AND COALESCE(p.is_deleted, false) = false
        ORDER BY a.id ASC
        `,
        [postId, gaId, me.teamId],
      )
      res.json({
        post: {
          id: String(row.id),
          teamId: String(row.team_id ?? ''),
          title: String(row.title ?? ''),
          content: String(row.content ?? ''),
          isNotice: Boolean(row.is_notice),
          createdAt: row.created_at,
          authorId: String(row.author_user_id ?? ''),
          authorUsername: String(row.author_username ?? ''),
          authorDisplayName: String(row.author_display_name ?? ''),
          attachments: atts.rows.map((a) => ({
            id: String(a.id),
            fileUrl: String(a.file_url ?? ''),
            fileName: String(a.file_name ?? ''),
          })),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.patch('/teams/posts/:postId', requireAuth, async (req, res) => {
    let trxClient = null
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const postId = String(req.params.postId ?? '').trim()
      if (!postId) {
        res.status(400).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `SELECT id, ga_id, owner_user_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const teamRow = teamRes.rows[0]
      const tGa = Number(teamRow.ga_id)
      if (!Number.isFinite(tGa) || tGa !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }
      const ownerId = teamRow.owner_user_id != null ? String(teamRow.owner_user_id) : ''

      const existing = await safeQuery(
        pool,
        `
        SELECT p.is_notice, p.author_user_id
        FROM team_posts p
        WHERE p.id = $1 AND p.ga_id = $2 AND p.team_id = $3
          AND COALESCE(p.is_deleted, false) = false
        LIMIT 1
        `,
        [postId, gaId, me.teamId],
      )
      if (existing.rowCount === 0) {
        res.status(404).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const ex = existing.rows[0]

      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const title = String(body.title ?? '').trim()
      const content = String(body.content ?? '').trim()
      const isNotice = Boolean(body.isNotice ?? body.is_notice)
      if (!title) {
        res.status(400).json({ message: '제목을 입력해 주세요.' })
        return
      }
      if (title.length > TEAM_POST_TITLE_MAX) {
        res.status(400).json({ message: `제목은 ${TEAM_POST_TITLE_MAX}자 이하로 입력해 주세요.` })
        return
      }
      if (!content) {
        res.status(400).json({ message: '내용을 입력해 주세요.' })
        return
      }
      if (content.length > TEAM_POST_CONTENT_MAX) {
        res.status(400).json({ message: `내용은 ${TEAM_POST_CONTENT_MAX}자 이하로 입력해 주세요.` })
        return
      }

      const wasNotice = Boolean(ex.is_notice)
      const elevNotice = isTeamPostElevatedRole(req.user?.role)
      if (isNotice && ownerId !== userId && !elevNotice) {
        res.status(403).json({ message: '공지로 지정할 수 있는 권한이 없습니다.' })
        return
      }
      if (wasNotice && !isNotice && ownerId !== userId && !elevNotice) {
        res.status(403).json({ message: '공지 해제는 팀장만 할 수 있습니다.' })
        return
      }

      const isElevated = isTeamPostElevatedRole(req.user?.role)
      const authorId = String(ex.author_user_id ?? '')
      const canEdit =
        isElevated || authorId === userId || (Boolean(ownerId) && userId === ownerId)
      if (!canEdit) {
        res.status(403).json({ message: '게시글을 수정할 권한이 없습니다.' })
        return
      }

      console.log('[update-post]', {
        postId,
        gaId,
        teamId: me.teamId,
      })

      if (isNotice) {
        trxClient = await pool.connect()
        await trxClient.query('BEGIN')
        await safeQuery(
          trxClient,
          `
          UPDATE team_posts
          SET is_notice = false
          WHERE team_id = $1 AND ga_id = $2 AND COALESCE(is_deleted, false) = false
          `,
          [me.teamId, gaId],
        )
      }

      const exec = trxClient ?? pool
      const upd = await safeQuery(
        exec,
        `
        UPDATE team_posts
        SET title = $1,
            content = $2,
            is_notice = $3,
            updated_at = NOW()
        WHERE id = $4
          AND ga_id = $5
          AND team_id = $6
          AND COALESCE(is_deleted, false) = false
        `,
        [title, content, isNotice, postId, gaId, me.teamId],
      )
      if (upd.rowCount === 0) {
        if (trxClient) {
          try {
            await trxClient.query('ROLLBACK')
          } catch {
            /* ignore */
          }
        }
        res.status(404).json({ message: '게시글을 찾을 수 없거나 수정 권한이 없습니다.' })
        return
      }
      if (trxClient) {
        await trxClient.query('COMMIT')
      }

      const postRes = await safeQuery(
        pool,
        `
        SELECT p.id, p.team_id, p.title, p.content, p.is_notice, p.created_at, p.author_user_id,
          u.username AS author_username, u.display_name AS author_display_name
        FROM team_posts p
        LEFT JOIN users u ON u.id = p.author_user_id AND u.ga_id = p.ga_id
        WHERE p.id = $1 AND p.team_id = $2 AND p.ga_id = $3
          AND COALESCE(p.is_deleted, false) = false
        LIMIT 1
        `,
        [postId, me.teamId, gaId],
      )
      const row = postRes.rows[0]
      const atts = await safeQuery(
        pool,
        `
        SELECT a.id, a.file_url, a.file_name
        FROM team_post_attachments a
        INNER JOIN team_posts p ON p.id = a.post_id
        WHERE a.post_id = $1 AND p.ga_id = $2 AND p.team_id = $3
          AND COALESCE(p.is_deleted, false) = false
        ORDER BY a.id ASC
        `,
        [postId, gaId, me.teamId],
      )
      res.json({
        post: {
          id: String(row.id),
          teamId: String(row.team_id ?? ''),
          title: String(row.title ?? ''),
          content: String(row.content ?? ''),
          isNotice: Boolean(row.is_notice),
          createdAt: row.created_at,
          authorId: String(row.author_user_id ?? ''),
          authorUsername: String(row.author_username ?? ''),
          authorDisplayName: String(row.author_display_name ?? ''),
          attachments: atts.rows.map((a) => ({
            id: String(a.id),
            fileUrl: String(a.file_url ?? ''),
            fileName: String(a.file_name ?? ''),
          })),
        },
      })
    } catch (error) {
      if (trxClient) {
        try {
          await trxClient.query('ROLLBACK')
        } catch {
          /* ignore */
        }
      }
      handleDbError(error, req, res)
    } finally {
      if (trxClient) {
        trxClient.release()
      }
    }
  })

  /** TODO: 실제 운영에서 데이터 보존이 필요하면 DELETE 대신 is_deleted / deleted_at soft delete 로 전환 */
  apiRouter.delete('/teams/posts/:postId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const postId = String(req.params.postId ?? '').trim()
      if (!postId) {
        res.status(400).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `SELECT id, ga_id, owner_user_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const teamRow = teamRes.rows[0]
      const tGa = Number(teamRow.ga_id)
      if (!Number.isFinite(tGa) || tGa !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }
      const ownerId = teamRow.owner_user_id != null ? String(teamRow.owner_user_id) : ''
      const ownerParam = ownerId ? ownerId : null
      const isElevated = isTeamPostElevatedRole(req.user?.role)

      const del = await safeQuery(
        pool,
        `
        DELETE FROM team_posts
        WHERE id = $1
          AND ga_id = $2
          AND team_id = $3
          AND COALESCE(is_deleted, false) = false
          AND (
            author_user_id = $4
            OR ($5 IS NOT NULL AND $4 = $5)
            OR $6 = true
          )
        `,
        [postId, gaId, me.teamId, userId, ownerParam, isElevated],
      )
      if (del.rowCount === 0) {
        res.status(404).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.get('/teams/posts/:postId/comments', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const postId = String(req.params.postId ?? '').trim()
      if (!postId) {
        res.status(400).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }
      const postOk = await safeQuery(
        pool,
        `
        SELECT p.id FROM team_posts p
        WHERE p.id = $1 AND p.ga_id = $2 AND p.team_id = $3 AND COALESCE(p.is_deleted, false) = false
        LIMIT 1
        `,
        [postId, gaId, me.teamId],
      )
      if (postOk.rowCount === 0) {
        res.status(404).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const r = await safeQuery(
        pool,
        `
        SELECT c.id, c.post_id, c.content, c.created_at, c.author_user_id,
          u.display_name AS author_display_name, u.username AS author_username
        FROM team_post_comments c
        INNER JOIN team_posts p ON p.id = c.post_id AND p.ga_id = c.ga_id AND p.team_id = c.team_id
        LEFT JOIN users u ON u.id = c.author_user_id AND u.ga_id = c.ga_id
        WHERE c.post_id = $1 AND c.ga_id = $2 AND c.team_id = $3
          AND COALESCE(c.is_deleted, false) = false
          AND COALESCE(p.is_deleted, false) = false
        ORDER BY c.created_at ASC
        `,
        [postId, gaId, me.teamId],
      )
      res.json({
        comments: r.rows.map((row) => ({
          id: String(row.id),
          postId: String(row.post_id ?? ''),
          content: String(row.content ?? ''),
          createdAt: row.created_at,
          authorId: String(row.author_user_id ?? ''),
          authorUsername: String(row.author_username ?? ''),
          authorDisplayName: String(row.author_display_name ?? ''),
        })),
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/teams/posts/:postId/comments', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const postId = String(req.params.postId ?? '').trim()
      if (!postId) {
        res.status(400).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const content = String(body.content ?? '').trim()
      if (!content) {
        res.status(400).json({ message: '댓글 내용을 입력해 주세요.' })
        return
      }
      if (content.length > TEAM_COMMENT_MAX) {
        res.status(400).json({ message: `댓글은 ${TEAM_COMMENT_MAX}자 이하로 입력해 주세요.` })
        return
      }
      const postMeta = await safeQuery(
        pool,
        `
        SELECT p.author_user_id
        FROM team_posts p
        WHERE p.id = $1 AND p.ga_id = $2 AND p.team_id = $3 AND COALESCE(p.is_deleted, false) = false
        LIMIT 1
        `,
        [postId, gaId, me.teamId],
      )
      if (postMeta.rowCount === 0) {
        res.status(404).json({ message: '게시글을 찾을 수 없습니다.' })
        return
      }
      const postAuthorId = postMeta.rows[0].author_user_id
      const ins = await safeQuery(
        pool,
        `
        INSERT INTO team_post_comments (post_id, team_id, ga_id, author_user_id, content)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, post_id, content, created_at, author_user_id
        `,
        [postId, me.teamId, gaId, userId, content],
      )
      const row = ins.rows[0]
      await notifyPostAuthorNewComment(pool, {
        gaId,
        teamId: me.teamId,
        postId,
        postAuthorId,
        actorUserId: userId,
      })
      res.status(201).json({
        comment: {
          id: String(row.id),
          postId: String(row.post_id ?? ''),
          content: String(row.content ?? ''),
          createdAt: row.created_at,
          authorId: String(row.author_user_id ?? ''),
        },
      })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.delete('/teams/post-comments/:commentId', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const commentId = String(req.params.commentId ?? '').trim()
      if (!commentId || !/^\d+$/.test(commentId)) {
        res.status(400).json({ message: '댓글을 찾을 수 없습니다.' })
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }
      const teamRes = await safeQuery(
        pool,
        `SELECT owner_user_id FROM teams WHERE id = $1 AND ga_id = $2 LIMIT 1`,
        [me.teamId, gaId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const ownerId = teamRes.rows[0].owner_user_id != null ? String(teamRes.rows[0].owner_user_id) : ''
      const ownerParam = ownerId ? ownerId : null
      const isElevated = isTeamPostElevatedRole(req.user?.role)
      const upd = await safeQuery(
        pool,
        `
        UPDATE team_post_comments
        SET is_deleted = true,
            deleted_at = NOW()
        WHERE id = $1::bigint
          AND ga_id = $2
          AND team_id = $3
          AND COALESCE(is_deleted, false) = false
          AND (
            author_user_id = $4
            OR ($5 IS NOT NULL AND $4 = $5)
            OR $6 = true
          )
        `,
        [commentId, gaId, me.teamId, userId, ownerParam, isElevated],
      )
      if (upd.rowCount === 0) {
        res.status(404).json({ message: '댓글을 찾을 수 없거나 삭제 권한이 없습니다.' })
        return
      }
      res.json({ ok: true })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/teams/posts/attachments/presign', requireAuth, async (req, res) => {
    try {
      if (!isConsentR2Enabled()) {
        logR2EnvDiagnosticCheck()
        res.status(503).json({ message: '파일 저장소가 구성되지 않았습니다.' })
        return
      }
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {}
      const fileNameRaw = String(body.fileName ?? 'file').trim() || 'file'
      const contentType = String(body.contentType ?? 'application/octet-stream').trim()
      const sizeBytes = Number(body.sizeBytes ?? body.size ?? 0)

      if (!TEAM_POST_ALLOWED_MIME.has(contentType)) {
        res.status(400).json({ message: '허용되지 않은 파일 형식입니다.' })
        return
      }
      const maxB = teamPostMaxBytesForMime(contentType)
      if (!Number.isFinite(sizeBytes) || sizeBytes < 1 || sizeBytes > maxB) {
        res.status(400).json({ message: '파일 크기가 허용 범위를 벗어났습니다.' })
        return
      }

      const safeSeg = fileNameRaw.replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120)
      const objectKey = `teams/${gaId}/${me.teamId}/attachments/${randomUUID()}-${safeSeg}`

      const cacheControl = getR2InsurerAttachmentsCacheControl()
      const uploadUrl = await r2GetPresignedPutUrl(objectKey, contentType, 900, { cacheControl })
      if (!uploadUrl) {
        res.status(503).json({ message: '업로드 URL을 만들 수 없습니다.' })
        return
      }
      const putHeaders = {}
      if (cacheControl) {
        putHeaders['Cache-Control'] = cacheControl
      }
      res.json({ uploadUrl, objectKey, putHeaders })
    } catch (error) {
      handleDbError(error, req, res)
    }
  })

  apiRouter.post('/teams/posts', requireAuth, async (req, res) => {
    const client = await pool.connect()
    try {
      const userId = req.user?.id ? String(req.user.id) : ''
      if (!userId) {
        res.status(401).json({ message: '로그인이 필요합니다.' })
        return
      }
      const gaId = requireGaTenantForTeam(req, res)
      if (gaId == null) {
        return
      }
      const me = await loadUserTeamContext(pool, userId)
      if (!me || me.gaId !== gaId) {
        res.status(403).json({ message: '사용자 정보를 확인할 수 없습니다.' })
        return
      }
      if (!me.teamId) {
        res.status(400).json({ message: '팀에 소속되어 있지 않습니다' })
        return
      }

      const teamRes = await safeQuery(
        pool,
        `SELECT id, ga_id, owner_user_id FROM teams WHERE id = $1 LIMIT 1`,
        [me.teamId],
      )
      if (teamRes.rowCount === 0) {
        res.status(404).json({ message: '팀을 찾을 수 없습니다.' })
        return
      }
      const team = teamRes.rows[0]
      const tGa = Number(team.ga_id)
      if (!Number.isFinite(tGa) || tGa !== gaId) {
        res.status(403).json({ message: '팀 정보가 GA와 일치하지 않습니다.' })
        return
      }
      const ownerId = team.owner_user_id != null ? String(team.owner_user_id) : ''
      /** team_id·ga_id 불일치 INSERT 방지: 위에서 team.ga_id === 요청 GA 확인됨 */
      if (!Number.isFinite(gaId) || !me.teamId) {
        res.status(400).json({ message: '팀 또는 GA 정보가 올바르지 않습니다.' })
        return
      }

      const body = req.body && typeof req.body === 'object' ? req.body : {}
      let title = String(body.title ?? '').trim()
      let content = String(body.content ?? '').trim()
      let isNotice = Boolean(body.isNotice ?? body.is_notice)
      if (!title) {
        res.status(400).json({ message: '제목을 입력해 주세요.' })
        return
      }
      if (title.length > TEAM_POST_TITLE_MAX) {
        res.status(400).json({ message: `제목은 ${TEAM_POST_TITLE_MAX}자 이하로 입력해 주세요.` })
        return
      }
      if (!content) {
        res.status(400).json({ message: '내용을 입력해 주세요.' })
        return
      }
      if (content.length > TEAM_POST_CONTENT_MAX) {
        res.status(400).json({ message: `내용은 ${TEAM_POST_CONTENT_MAX}자 이하로 입력해 주세요.` })
        return
      }
      if (isNotice && ownerId !== userId) {
        res.status(403).json({ message: '공지는 팀장만 등록할 수 있습니다.' })
        return
      }

      const rawAtt = body.attachments
      const attachments = Array.isArray(rawAtt) ? rawAtt : []
      if (attachments.length > TEAM_POST_ATTACH_MAX) {
        res.status(400).json({ message: `첨부는 ${TEAM_POST_ATTACH_MAX}개까지 가능합니다.` })
        return
      }

      const base = getR2PublicCdnBase()
      for (const a of attachments) {
        const objectKey = String(a?.objectKey ?? '').trim()
        const fileName = String(a?.fileName ?? 'file').trim() || 'file'
        if (!objectKey || !assertTeamPostAttachmentKey(objectKey, gaId, me.teamId)) {
          res.status(400).json({ message: '유효하지 않은 첨부입니다.' })
          return
        }
        const expectedUrl = `${base}/${objectKey.replace(/^\//, '')}`
        const fileUrl = String(a?.fileUrl ?? '').trim()
        if (fileUrl !== expectedUrl) {
          res.status(400).json({ message: '첨부 URL이 서명과 일치하지 않습니다.' })
          return
        }
        if (fileName.length > 240) {
          res.status(400).json({ message: '첨부 파일 이름이 너무 깁니다.' })
          return
        }
      }

      const postId = randomUUID()
      await client.query('BEGIN')
      if (isNotice) {
        await safeQuery(
          client,
          `
          UPDATE team_posts
          SET is_notice = false
          WHERE team_id = $1 AND ga_id = $2 AND COALESCE(is_deleted, false) = false
          `,
          [me.teamId, gaId],
        )
      }
      await client.query(
        `
        INSERT INTO team_posts (id, team_id, ga_id, author_user_id, title, content, is_notice, is_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, false)
        `,
        [postId, me.teamId, gaId, userId, title, content, isNotice],
      )
      for (const a of attachments) {
        const objectKey = String(a.objectKey ?? '').trim()
        const fileName = String(a.fileName ?? 'file').trim() || 'file'
        const fileUrl = `${base}/${objectKey.replace(/^\//, '')}`
        const aid = randomUUID()
        await client.query(
          `
          INSERT INTO team_post_attachments (id, post_id, file_url, file_name)
          VALUES ($1, $2, $3, $4)
          `,
          [aid, postId, fileUrl, fileName],
        )
      }
      await notifyTeamMembersNewPost(client, {
        teamId: me.teamId,
        gaId,
        authorUserId: userId,
        postId,
        title,
      })
      await client.query('COMMIT')
      res.status(201).json({
        postId,
        teamId: me.teamId,
      })
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(error, req, res)
    } finally {
      client.release()
    }
  })
}
