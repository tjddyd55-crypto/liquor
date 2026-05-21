/**
 * 자료실/서식함 CRUD.
 * @module governmentResources
 */
import {
  GOVERNMENT_SCOPE_AGENCY,
  GOVERNMENT_SCOPE_GLOBAL,
  parseResourceCategory,
  parseResourceStatus,
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
export function mapResourceRow(row) {
  return {
    id: String(row.id),
    tenantId: row.tenant_id != null ? String(row.tenant_id) : null,
    scopeType: String(row.scope_type ?? GOVERNMENT_SCOPE_AGENCY),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    category: String(row.category ?? 'other'),
    status: String(row.status ?? 'draft'),
    fileName: String(row.file_name ?? ''),
    fileKey: String(row.file_key ?? ''),
    fileSize: Number(row.file_size ?? 0) || 0,
    mimeType: String(row.mime_type ?? ''),
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
export async function listGovernmentResources(pool, ctx, query = {}) {
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
    'resource',
    'r',
  )
  if (!built.ok) {
    return built
  }
  const r = await pool.query(
    `
    SELECT
      r.*,
      t.name AS tenant_name,
      COALESCE(u.display_name, u.username, '') AS created_by_display_name
    FROM gov_support_resources r
    LEFT JOIN tenants t ON t.id = r.tenant_id
    LEFT JOIN users u ON u.id = r.created_by_user_id
    WHERE ${built.whereSql}
    ORDER BY r.published_at DESC NULLS LAST, r.updated_at DESC, r.id DESC
    `,
    built.params,
  )
  return { ok: true, data: r.rows.map(mapResourceRow) }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 * @param {{ managerView?: boolean }} opts
 */
export async function getGovernmentResource(pool, ctx, id, opts = {}) {
  const resourceId = String(id ?? '').trim()
  if (!resourceId) {
    return { ok: false, status: 400, message: 'id가 필요합니다.' }
  }
  const r = await pool.query(
    `
    SELECT
      r.*,
      t.name AS tenant_name,
      COALESCE(u.display_name, u.username, '') AS created_by_display_name
    FROM gov_support_resources r
    LEFT JOIN tenants t ON t.id = r.tenant_id
    LEFT JOIN users u ON u.id = r.created_by_user_id
    WHERE r.id = $1::bigint
    LIMIT 1
    `,
    [resourceId],
  )
  const row = r.rows[0]
  if (!row) {
    return { ok: false, status: 404, message: '자료를 찾을 수 없습니다.' }
  }
  const managerView = Boolean(opts.managerView)
  if (!canReadOperationalRecord(ctx, row, { managerView })) {
    return { ok: false, status: 403, message: '자료 접근 권한이 없습니다.' }
  }
  return { ok: true, data: mapResourceRow(row) }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {Record<string, unknown>} body
 */
export async function createGovernmentResource(pool, ctx, body) {
  if (!canManageGovernmentOperations(ctx)) {
    return { ok: false, status: 403, message: '자료 등록 권한이 없습니다.' }
  }
  const scopeType = parseScopeType(body.scopeType ?? body.scope_type)
  const tenantIdRaw = body.tenantId ?? body.tenant_id ?? null
  const tenantId =
    scopeType === GOVERNMENT_SCOPE_GLOBAL
      ? null
      : tenantIdRaw != null
        ? String(tenantIdRaw).trim()
        : null
  if (scopeType === GOVERNMENT_SCOPE_AGENCY && !tenantId) {
    return { ok: false, status: 400, message: '대행사 자료는 tenantId가 필요합니다.' }
  }
  if (!canWriteOperationalScope(ctx, tenantId, scopeType)) {
    return { ok: false, status: 403, message: '해당 범위에 자료를 등록할 수 없습니다.' }
  }
  const title = String(body.title ?? '').trim()
  const fileKey = String(body.fileKey ?? body.file_key ?? '').trim()
  const fileName = String(body.fileName ?? body.file_name ?? '').trim()
  if (!title) {
    return { ok: false, status: 400, message: '제목을 입력하세요.' }
  }
  if (!fileKey || !fileName) {
    return { ok: false, status: 400, message: '파일 정보가 필요합니다.' }
  }
  const status = parseResourceStatus(body.status)
  const publishedAt = status === 'published' ? new Date() : null
  const r = await pool.query(
    `
    INSERT INTO gov_support_resources (
      tenant_id, scope_type, title, description, category, status,
      file_name, file_key, file_size, mime_type,
      created_by_user_id, updated_by_user_id, published_at
    ) VALUES ($1::bigint, $2, $3, $4, $5, $6, $7, $8, $9::bigint, $10, $11::text, $11::text, $12)
    RETURNING id
    `,
    [
      tenantId,
      scopeType,
      title,
      String(body.description ?? ''),
      parseResourceCategory(body.category),
      status,
      fileName,
      fileKey,
      Number(body.fileSize ?? body.file_size ?? 0) || 0,
      String(body.mimeType ?? body.mime_type ?? 'application/octet-stream'),
      ctx.userId,
      publishedAt,
    ],
  )
  return getGovernmentResource(pool, ctx, String(r.rows[0].id), { managerView: true })
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 * @param {Record<string, unknown>} body
 */
export async function updateGovernmentResource(pool, ctx, id, body) {
  if (!canManageGovernmentOperations(ctx)) {
    return { ok: false, status: 403, message: '자료 수정 권한이 없습니다.' }
  }
  const existing = await getGovernmentResource(pool, ctx, id, { managerView: true })
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
    return { ok: false, status: 403, message: '해당 범위의 자료를 수정할 수 없습니다.' }
  }
  const nextStatus = body.status != null ? parseResourceStatus(body.status) : existing.data.status
  const publishedAt =
    nextStatus === 'published' && existing.data.status !== 'published'
      ? new Date()
      : existing.data.publishedAt
  const fileKey = body.fileKey ?? body.file_key
  const fileName = body.fileName ?? body.file_name
  const r = await pool.query(
    `
    UPDATE gov_support_resources SET
      tenant_id = $2::bigint,
      scope_type = $3,
      title = COALESCE($4, title),
      description = COALESCE($5, description),
      category = COALESCE($6, category),
      status = $7,
      file_name = COALESCE($8, file_name),
      file_key = COALESCE($9, file_key),
      file_size = COALESCE($10::bigint, file_size),
      mime_type = COALESCE($11, mime_type),
      updated_by_user_id = $12::text,
      published_at = $13,
      updated_at = NOW()
    WHERE id = $1::bigint
    RETURNING id
    `,
    [
      id,
      tenantId,
      scopeType,
      body.title != null ? String(body.title).trim() : null,
      body.description != null ? String(body.description) : null,
      body.category != null ? parseResourceCategory(body.category) : null,
      nextStatus,
      fileName != null ? String(fileName) : null,
      fileKey != null ? String(fileKey) : null,
      body.fileSize != null || body.file_size != null
        ? Number(body.fileSize ?? body.file_size)
        : null,
      body.mimeType != null || body.mime_type != null
        ? String(body.mimeType ?? body.mime_type)
        : null,
      ctx.userId,
      publishedAt,
    ],
  )
  if ((r.rowCount ?? 0) === 0) {
    return { ok: false, status: 404, message: '자료를 찾을 수 없습니다.' }
  }
  return getGovernmentResource(pool, ctx, id, { managerView: true })
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 */
export async function archiveGovernmentResource(pool, ctx, id) {
  const ex = await pool.query(`SELECT * FROM gov_support_resources WHERE id = $1::bigint`, [id])
  const row = ex.rows[0]
  if (!row) {
    return { ok: false, status: 404, message: '자료를 찾을 수 없습니다.' }
  }
  if (!canDeleteOperationalRecord(ctx, row)) {
    return { ok: false, status: 403, message: '자료 삭제/보관 권한이 없습니다.' }
  }
  await pool.query(
    `UPDATE gov_support_resources SET status = 'archived', updated_by_user_id = $2::text, updated_at = NOW() WHERE id = $1::bigint`,
    [id, ctx.userId],
  )
  return { ok: true, message: '자료를 보관 처리했습니다.' }
}

/**
 * @param {import('pg').Pool} pool
 * @param {import('../platformRbac.js').EffectivePlatformContext} ctx
 * @param {string} id
 */
export async function createGovernmentResourceDraftRow(pool, ctx, body) {
  if (!canManageGovernmentOperations(ctx)) {
    return { ok: false, status: 403, message: '자료 등록 권한이 없습니다.' }
  }
  const scopeType = parseScopeType(body.scopeType ?? body.scope_type)
  const tenantIdRaw = body.tenantId ?? body.tenant_id ?? null
  const tenantId =
    scopeType === GOVERNMENT_SCOPE_GLOBAL
      ? null
      : tenantIdRaw != null
        ? String(tenantIdRaw).trim()
        : null
  if (scopeType === GOVERNMENT_SCOPE_AGENCY && !tenantId) {
    return { ok: false, status: 400, message: '대행사 자료는 tenantId가 필요합니다.' }
  }
  if (!canWriteOperationalScope(ctx, tenantId, scopeType)) {
    return { ok: false, status: 403, message: '해당 범위에 자료를 등록할 수 없습니다.' }
  }
  const r = await pool.query(
    `
    INSERT INTO gov_support_resources (
      tenant_id, scope_type, title, description, category, status,
      file_name, file_key, file_size, mime_type,
      created_by_user_id, updated_by_user_id
    ) VALUES ($1::bigint, $2, '', '', 'other', 'draft', '', '', 0, '', $3::text, $3::text)
    RETURNING id, tenant_id, scope_type
    `,
    [tenantId, scopeType, ctx.userId],
  )
  return { ok: true, data: r.rows[0] }
}
