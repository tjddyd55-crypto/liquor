/**
 * 공지/전달사항 CRUD.
 * @module governmentNotices
 */
import {
  GOVERNMENT_SCOPE_AGENCY,
  GOVERNMENT_SCOPE_GLOBAL,
  parseNoticeCategory,
  parseNoticeStatus,
  parseScopeType,
} from './governmentOperationsConstants.js'
import {
  buildOperationalListQuery,
  canDeleteOperationalRecord,
  canManageGovernmentOperations,
  canReadOperationalRecord,
  canWriteOperationalScope,
} from './governmentOperationsAccess.js'

/**
 * @param {Record<string, unknown>} row
 */
export function mapNoticeRow(row) {
  return {
    id: String(row.id),
    tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
    scopeType: String(row.scope_type ?? GOVERNMENT_SCOPE_AGENCY),
    title: String(row.title ?? ''),
    content: String(row.content ?? ''),
    category: String(row.category ?? 'general'),
    status: String(row.status ?? 'draft'),
    isPinned: Boolean(row.is_pinned),
    createdByUserId: row.created_by_user_id != null ? String(row.created_by_user_id) : null,
    updatedByUserId: row.updated_by_user_id != null ? String(row.updated_by_user_id) : null,
    createdByDisplayName: row.created_by_display_name != null ? String(row.created_by_display_name) : '',
    publishedAt: row.published_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
    tenantName: row.tenant_name != null ? String(row.tenant_name) : '',
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {Record<string, unknown>} query
 */
export async function listGovernmentNotices(pool, ctx, query = {}) {
  const managerView =
    canManageGovernmentOperations(ctx) && String(query.managerView ?? '') === 'true'
  const built = buildOperationalListQuery(
    ctx,
    {
      managerView,
      status: query.status ? String(query.status) : null,
      category: query.category ? String(query.category) : null,
      q: query.q ? String(query.q) : null,
      tenantId: query.tenantId ? String(query.tenantId) : null,
    },
    'notice',
    'n',
  )
  if (!built.ok) {
    return built
  }
  const r = await pool.query(
    `
    SELECT
      n.*,
      t.name AS tenant_name,
      COALESCE(u.display_name, u.username, '') AS created_by_display_name
    FROM gov_support_notices n
    LEFT JOIN tenants t ON t.id = n.tenant_id
    LEFT JOIN users u ON u.id = n.created_by_user_id
    WHERE ${built.whereSql}
    ORDER BY n.is_pinned DESC, n.published_at DESC NULLS LAST, n.updated_at DESC, n.id DESC
    `,
    built.params,
  )
  return { ok: true, data: r.rows.map(mapNoticeRow) }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 * @param {{ managerView?: boolean }} opts
 */
export async function getGovernmentNotice(pool, ctx, id, opts = {}) {
  const noticeId = String(id ?? '').trim()
  if (!noticeId) {
    return { ok: false, status: 400, message: 'id가 필요합니다.' }
  }
  const r = await pool.query(
    `
    SELECT
      n.*,
      t.name AS tenant_name,
      COALESCE(u.display_name, u.username, '') AS created_by_display_name
    FROM gov_support_notices n
    LEFT JOIN tenants t ON t.id = n.tenant_id
    LEFT JOIN users u ON u.id = n.created_by_user_id
    WHERE n.id = $1::bigint
    LIMIT 1
    `,
    [noticeId],
  )
  const row = r.rows[0]
  if (!row) {
    return { ok: false, status: 404, message: '공지를 찾을 수 없습니다.' }
  }
  const managerView = Boolean(opts.managerView)
  if (!canReadOperationalRecord(ctx, row, { managerView })) {
    return { ok: false, status: 403, message: '공지 접근 권한이 없습니다.' }
  }
  return { ok: true, data: mapNoticeRow(row) }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {Record<string, unknown>} body
 */
export async function createGovernmentNotice(pool, ctx, body) {
  if (!canManageGovernmentOperations(ctx)) {
    return { ok: false, status: 403, message: '공지 작성 권한이 없습니다.' }
  }
  const scopeType = parseScopeType(body.scopeType ?? body.scope_type ?? body.targetScope)
  const tenantIdRaw = body.tenantId ?? body.tenant_id ?? null
  const tenantId =
    scopeType === GOVERNMENT_SCOPE_GLOBAL
      ? null
      : tenantIdRaw != null
        ? String(tenantIdRaw).trim()
        : null
  if (scopeType === GOVERNMENT_SCOPE_AGENCY && !tenantId) {
    return { ok: false, status: 400, message: '대행사 공지는 tenantId가 필요합니다.' }
  }
  if (!canWriteOperationalScope(ctx, tenantId, scopeType)) {
    return { ok: false, status: 403, message: '해당 범위에 공지를 작성할 수 없습니다.' }
  }
  const title = String(body.title ?? '').trim()
  if (!title) {
    return { ok: false, status: 400, message: '제목을 입력하세요.' }
  }
  const status = parseNoticeStatus(body.status)
  const publishedAt = status === 'published' ? new Date() : null
  const r = await pool.query(
    `
    INSERT INTO gov_support_notices (
      tenant_id, scope_type, title, content, category, status, is_pinned,
      created_by_user_id, updated_by_user_id, published_at
    ) VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8::text, $8::text, $9)
    RETURNING *
    `,
    [
      tenantId,
      scopeType,
      title,
      String(body.content ?? ''),
      parseNoticeCategory(body.category),
      status,
      Boolean(body.isPinned ?? body.is_pinned),
      ctx.userId,
      publishedAt,
    ],
  )
  return getGovernmentNotice(pool, ctx, String(r.rows[0].id), { managerView: true })
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export async function updateGovernmentNotice(pool, ctx, id, body) {
  if (!canManageGovernmentOperations(ctx)) {
    return { ok: false, status: 403, message: '공지 수정 권한이 없습니다.' }
  }
  const existing = await getGovernmentNotice(pool, ctx, id, { managerView: true })
  if (!existing.ok) {
    return existing
  }
  const scopeType = body.scopeType != null || body.scope_type != null
    ? parseScopeType(body.scopeType ?? body.scope_type)
    : existing.data.scopeType
  const tenantId =
    scopeType === GOVERNMENT_SCOPE_GLOBAL
      ? null
      : body.tenantId != null || body.tenant_id != null
        ? String(body.tenantId ?? body.tenant_id).trim()
        : existing.data.tenantId
  if (!canWriteOperationalScope(ctx, tenantId, scopeType)) {
    return { ok: false, status: 403, message: '해당 범위의 공지를 수정할 수 없습니다.' }
  }
  const nextStatus = body.status != null ? parseNoticeStatus(body.status) : existing.data.status
  const publishedAt =
    nextStatus === 'published' && existing.data.status !== 'published'
      ? new Date()
      : existing.data.publishedAt
  const r = await pool.query(
    `
    UPDATE gov_support_notices SET
      tenant_id = $2::bigint,
      scope_type = $3,
      title = COALESCE($4, title),
      content = COALESCE($5, content),
      category = COALESCE($6, category),
      status = $7,
      is_pinned = COALESCE($8, is_pinned),
      updated_by_user_id = $9::text,
      published_at = $10,
      updated_at = NOW()
    WHERE id = $1::bigint
    RETURNING id
    `,
    [
      id,
      tenantId,
      scopeType,
      body.title != null ? String(body.title).trim() : null,
      body.content != null ? String(body.content) : null,
      body.category != null ? parseNoticeCategory(body.category) : null,
      nextStatus,
      body.isPinned != null ? Boolean(body.isPinned) : body.is_pinned != null ? Boolean(body.is_pinned) : null,
      ctx.userId,
      publishedAt,
    ],
  )
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, message: '공지를 찾을 수 없습니다.' }
  }
  return getGovernmentNotice(pool, ctx, id, { managerView: true })
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 */
export async function archiveGovernmentNotice(pool, ctx, id) {
  const ex = await pool.query(`SELECT * FROM gov_support_notices WHERE id = $1::bigint`, [id])
  const row = ex.rows[0]
  if (!row) {
    return { ok: false, status: 404, message: '공지를 찾을 수 없습니다.' }
  }
  if (!canDeleteOperationalRecord(ctx, row)) {
    return { ok: false, status: 403, message: '공지 삭제/보관 권한이 없습니다.' }
  }
  await pool.query(
    `UPDATE gov_support_notices SET status = 'archived', updated_by_user_id = $2::text, updated_at = NOW() WHERE id = $1::bigint`,
    [id, ctx.userId],
  )
  return { ok: true, message: '공지를 보관 처리했습니다.' }
}
