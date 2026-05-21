/**
 * PDF 템플릿/필드 레포지토리.
 *
 * 책임: DB 접근만. SQL 은 이 파일 바깥으로 나가지 않는다.
 * 상위 레이어(API 핸들러)는 이 모듈의 시그니처만 보고 동작한다 — 테이블 구조가 바뀌어도
 * 이 파일 안에서만 수정하면 된다.
 *
 * 트랜잭션 경계:
 *   - 필드 저장은 replaceTemplateFields 가 내부에서 트랜잭션을 연다(기존 필드 전체 삭제
 *     → 새 필드 일괄 삽입). 템플릿 메타 수정과 필드 교체를 같은 트랜잭션에 묶고 싶으면
 *     호출측에서 외부 트랜잭션을 도입해야 하지만, Phase 1 에서는 독립으로 충분하다.
 */

import { serializeFieldDataMapping } from '../schema/fieldDataMapping.js'

/** @typedef {import('../schema/fieldSpec.js').FieldSpec} FieldSpec */

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 */
function makeQuery(executor) {
  return (text, params) => executor.query(text, params)
}

/**
 * 템플릿 1건을 생성하고 id 반환.
 *
 * @param {import('pg').Pool} pool
 * @param {{
 *   gaId: number | null,
 *   code: string,
 *   title: string,
 *   description: string,
 *   storageKey: string,
 *   pageCount: number,
 *   createdByUserId: string | null,
 * }} input
 */
export async function createTemplate(pool, input) {
  const q = makeQuery(pool)
  const { rows } = await q(
    `INSERT INTO pdf_templates
       (ga_id, code, title, description, storage_key, page_count, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, ga_id, code, title, description, storage_key, page_count, is_active, created_at, updated_at`,
    [
      input.gaId,
      input.code,
      input.title,
      input.description ?? '',
      input.storageKey,
      input.pageCount,
      input.createdByUserId,
    ],
  )
  return rows[0]
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} id
 */
export async function getTemplateById(pool, id) {
  const q = makeQuery(pool)
  const { rows } = await q(
    `SELECT id, ga_id, code, title, description, storage_key, page_count,
            is_active, created_by_user_id, created_at, updated_at
       FROM pdf_templates
       WHERE id = $1
       LIMIT 1`,
    [id],
  )
  return rows[0] ?? null
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ gaId: number | null, includeInactive: boolean }} filter
 * @returns {Promise<Array<object>>}
 */
export async function listTemplates(pool, filter) {
  const q = makeQuery(pool)
  const params = []
  const conditions = []

  if (filter.gaId != null) {
    params.push(filter.gaId)
    /* 본인 GA + 공용(ga_id IS NULL) 둘 다 노출. 관리자(전체 범위) 는 gaId=null 전달. */
    conditions.push(`(ga_id = $${params.length} OR ga_id IS NULL)`)
  }
  if (!filter.includeInactive) {
    conditions.push('is_active = true')
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await q(
    `SELECT t.id, t.ga_id, t.code, t.title, t.description, t.page_count, t.is_active,
            t.created_at, t.updated_at,
            g.name AS ga_name, g.code AS ga_code
       FROM pdf_templates t
       LEFT JOIN ga_companies g ON g.id = t.ga_id
       ${where}
       ORDER BY t.ga_id NULLS FIRST, t.code ASC`,
    params,
  )
  return rows
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} id
 * @param {{ title?: string, description?: string, isActive?: boolean }} patch
 */
export async function updateTemplateMeta(pool, id, patch) {
  const sets = []
  const params = []
  if (patch.title !== undefined) {
    params.push(patch.title)
    sets.push(`title = $${params.length}`)
  }
  if (patch.description !== undefined) {
    params.push(patch.description)
    sets.push(`description = $${params.length}`)
  }
  if (patch.isActive !== undefined) {
    params.push(Boolean(patch.isActive))
    sets.push(`is_active = $${params.length}`)
  }
  if (sets.length === 0) {
    return
  }
  sets.push('updated_at = NOW()')
  params.push(id)
  await pool.query(
    `UPDATE pdf_templates SET ${sets.join(', ')} WHERE id = $${params.length}`,
    params,
  )
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} id
 */
export async function deleteTemplate(pool, id) {
  /* fields 는 ON DELETE CASCADE 로 자동 삭제. 스토리지 객체는 호출측에서 책임. */
  await pool.query(`DELETE FROM pdf_templates WHERE id = $1`, [id])
}

/**
 * 템플릿의 필드 전체를 조회.
 *
 * @param {import('pg').Pool} pool
 * @param {number} templateId
 */
export async function listFields(pool, templateId) {
  const { rows } = await pool.query(
    `SELECT id, template_id, field_key, label, field_type, required, order_index,
            input_role, customer_mapping, options, placements, created_at, updated_at
       FROM pdf_template_fields
       WHERE template_id = $1
       ORDER BY order_index ASC, id ASC`,
    [templateId],
  )
  return rows
}

/**
 * 필드 전체를 교체(replace-all). 기존 필드 삭제 → 새 필드 삽입을 한 트랜잭션으로.
 *
 * @param {import('pg').Pool} pool
 * @param {number} templateId
 * @param {FieldSpec[]} fields
 */
export async function replaceTemplateFields(pool, templateId, fields) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`DELETE FROM pdf_template_fields WHERE template_id = $1`, [templateId])
    for (let i = 0; i < fields.length; i += 1) {
      const f = fields[i]
      /* options 는 radio 에서만 의미가 있다. 다른 타입은 NULL 로 저장해
         "type 이 radio 가 아닌데 options 가 남아 있는" 비일관 상태를 원천 차단한다. */
      const optionsJson =
        f.fieldType === 'radio' && Array.isArray(f.options) ? JSON.stringify(f.options) : null
      const mappingSerialized = serializeFieldDataMapping(f.dataMapping)
      await client.query(
        `INSERT INTO pdf_template_fields
           (template_id, field_key, label, field_type, required, order_index,
            input_role, customer_mapping, options, placements)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CAST($9 AS jsonb), CAST($10 AS jsonb))`,
        [
          templateId,
          f.fieldKey,
          f.label,
          f.fieldType,
          f.required,
          f.orderIndex ?? i,
          f.inputRole ?? 'customer',
          mappingSerialized,
          optionsJson,
          JSON.stringify(f.placements ?? []),
        ],
      )
    }
    await client.query(`UPDATE pdf_templates SET updated_at = NOW() WHERE id = $1`, [templateId])
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
