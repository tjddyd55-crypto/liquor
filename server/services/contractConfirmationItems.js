import { randomUUID } from 'node:crypto'

const CCI_PREFIX = 'cci_'
const CCIV_PREFIX = 'cciv_'
export const CONTRACT_CONFIRMATION_MAX_ITEMS = 10
export const CONTRACT_CONFIRMATION_MAX_LABEL_LEN = 200

export function newConfirmationItemId() {
  return `${CCI_PREFIX}${randomUUID()}`
}

export function newConfirmationValueId() {
  return `${CCIV_PREFIX}${randomUUID()}`
}

/**
 * 발송 API 본문에서 고객 확인 항목 정규화.
 * @param {unknown} raw
 * @returns {{ ok: true, items: { label: string, required: boolean }[] } | { ok: false, message: string }}
 */
export function parseConfirmationItemsFromBody(raw) {
  if (raw == null) {
    return { ok: true, items: [] }
  }
  if (!Array.isArray(raw)) {
    return { ok: true, items: [] }
  }
  if (raw.length > CONTRACT_CONFIRMATION_MAX_ITEMS) {
    return { ok: false, message: '확인 항목은 최대 10개까지 추가할 수 있습니다.' }
  }
  const seen = new Set()
  const items = []
  for (const entry of raw) {
    const label = String(entry?.label ?? '').trim()
    if (!label) {
      return { ok: false, message: '확인 항목 문구가 비어 있습니다.' }
    }
    if (label.length > CONTRACT_CONFIRMATION_MAX_LABEL_LEN) {
      return { ok: false, message: '확인 항목 문구는 200자 이내입니다.' }
    }
    const dedupeKey = label.toLowerCase()
    if (seen.has(dedupeKey)) {
      return { ok: false, message: '중복된 확인 문구가 있습니다.' }
    }
    seen.add(dedupeKey)
    const required = entry?.required !== false
    items.push({ label, required })
  }
  return { ok: true, items }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 * @param {{ label: string, required: boolean }[]} normalizedItems
 * @returns {Promise<{ id: string, label: string, required: boolean }[]>}
 */
export async function insertConfirmationItemsForSendSession(client, sendSessionId, normalizedItems) {
  const out = []
  for (let i = 0; i < normalizedItems.length; i += 1) {
    const it = normalizedItems[i]
    const cid = newConfirmationItemId()
    await client.query(
      `
      INSERT INTO contract_confirmation_items (id, send_session_id, label, required, sort_order, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [cid, sendSessionId, it.label, it.required, i],
    )
    out.push({ id: cid, label: it.label, required: it.required })
  }
  return out
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {string} sendSessionId
 */
export async function listConfirmationItemsWithValues(executor, sendSessionId) {
  const r = await executor.query(
    `
    SELECT
      i.id,
      i.label,
      i.required,
      i.sort_order,
      COALESCE(v.checked, false) AS checked,
      v.checked_at
    FROM contract_confirmation_items i
    LEFT JOIN contract_confirmation_item_values v
      ON v.confirmation_item_id = i.id AND v.send_session_id = i.send_session_id
    WHERE i.send_session_id = $1
    ORDER BY i.sort_order ASC, i.id ASC
    `,
    [sendSessionId],
  )
  return r.rows.map((row) => ({
    id: String(row.id),
    label: String(row.label ?? ''),
    required: row.required === true || row.required === 1,
    sortOrder: Number(row.sort_order ?? 0),
    checked: Boolean(row.checked),
    checkedAt: row.checked_at ? new Date(row.checked_at).toISOString() : null,
  }))
}

/**
 * @param {Array<{ id?: unknown, label?: unknown, required?: unknown }>} sessionItems
 * @param {Set<string>} checkedIdSet
 * @returns {{ ok: true } | { ok: false, code: string, message: string, missing?: { id: string, label: string }[] }}
 */
export function validateConfirmationCheckedForComplete(sessionItems, checkedIdSet) {
  const allowed = new Set(sessionItems.map((x) => String(x.id)))
  for (const cid of checkedIdSet) {
    const s = String(cid)
    if (!allowed.has(s)) {
      return {
        ok: false,
        code: 'invalid_confirmation_selection',
        message: '선택한 확인 항목이 유효하지 않습니다.',
      }
    }
  }
  /** @type {{ id: string, label: string }[]} */
  const missing = []
  for (const it of sessionItems) {
    const req = it.required === true || it.required === 1 || it.required === 't'
    if (req && !checkedIdSet.has(String(it.id))) {
      missing.push({ id: String(it.id), label: String(it.label ?? '') })
    }
  }
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'required_confirmations_missing',
      message: '필수 확인 항목을 모두 체크해 주세요.',
      missing,
    }
  }
  return { ok: true }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} sendSessionId
 * @param {Set<string>} checkedIdSet
 * @param {Array<{ id: unknown }>} sessionItems
 */
export async function upsertConfirmationValuesForComplete(client, sendSessionId, checkedIdSet, sessionItems) {
  const now = new Date()
  for (const it of sessionItems) {
    const iid = String(it.id)
    const checked = checkedIdSet.has(iid)
    await client.query(
      `
      INSERT INTO contract_confirmation_item_values (
        id, send_session_id, confirmation_item_id, checked, checked_at, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (send_session_id, confirmation_item_id)
      DO UPDATE SET
        checked = EXCLUDED.checked,
        checked_at = EXCLUDED.checked_at,
        updated_at = NOW()
      `,
      [newConfirmationValueId(), sendSessionId, iid, checked, checked ? now : null],
    )
  }
}
