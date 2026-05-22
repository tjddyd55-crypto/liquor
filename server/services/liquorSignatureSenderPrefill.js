import { randomUUID } from 'node:crypto'
import { listFields } from '../pdf-engine/repository/liquorPdfTemplateRepo.js'
import {
  effectiveLiquorSignatureFieldRole,
  loadContractFieldSettingsMap,
} from './liquorSignatureTemplateFieldSettings.js'
import { normalizeContractFieldStoredValue } from './liquorSignatureFieldValueNormalize.js'

/**
 * 설계사(sender) 입력 값을 검증하고 liquor_signature_document_values 행 목록(SQL 파라미터)을 만든다.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} liquorSignatureTemplateId
 * @param {number} pdfTemplateId
 * @param {Record<string, unknown>} senderValuesByFieldKey
 */
export async function assertSenderFieldValuesFilled(db, liquorSignatureTemplateId, pdfTemplateId, senderValuesByFieldKey) {
  const fields = await listFields(db, pdfTemplateId)
  const settingsMap = await loadContractFieldSettingsMap(db, liquorSignatureTemplateId)
  const missed = []
  for (const f of fields) {
    const fk = String(f.field_key)
    const role = effectiveLiquorSignatureFieldRole(f, settingsMap.get(fk))
    if (role !== 'sender' || String(f.field_type) === 'signature') {
      continue
    }
    const raw = Object.prototype.hasOwnProperty.call(senderValuesByFieldKey, fk)
      ? senderValuesByFieldKey[fk]
      : undefined
    const normalized = normalizeContractFieldStoredValue(f, raw)
    if (!normalized.ok) {
      return { ok: false, status: 400, message: normalized.message ?? '발송 입력 값이 올바르지 않습니다.' }
    }
    const vt = normalized.valueText ?? ''
    if (!f.required) {
      continue
    }
    if (String(f.field_type) === 'checkbox') {
      let sel = []
      try {
        const parsed = JSON.parse(vt || '[]')
        sel = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []
      } catch {
        sel = vt === 'true' ? ['x'] : []
      }
      if (sel.length === 0) {
        missed.push(f.label ?? fk)
      }
      continue
    }
    if (String(vt).trim() === '') {
      missed.push(f.label ?? fk)
    }
  }
  if (missed.length > 0) {
    return {
      ok: false,
      status: 400,
      message: `발송 전 입력이 필요합니다: ${missed.slice(0, 8).join(', ')}${missed.length > 8 ? ' …' : ''}`,
    }
  }
  return { ok: true }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} documentInstanceId
 * @param {string} liquorSignatureTemplateId
 * @param {number} pdfTemplateId
 * @param {Record<string, unknown>} senderValuesByFieldKey
 */
export async function insertSenderPrefillDocumentValues(
  client,
  documentInstanceId,
  liquorSignatureTemplateId,
  pdfTemplateId,
  senderValuesByFieldKey,
) {
  const fields = await listFields(client, pdfTemplateId)
  const settingsMap = await loadContractFieldSettingsMap(client, liquorSignatureTemplateId)
  for (const f of fields) {
    const fk = String(f.field_key)
    const role = effectiveLiquorSignatureFieldRole(f, settingsMap.get(fk))
    if (role !== 'sender' || String(f.field_type) === 'signature') {
      continue
    }
    if (!Object.prototype.hasOwnProperty.call(senderValuesByFieldKey, fk)) {
      continue
    }
    const raw = senderValuesByFieldKey[fk]
    const normalized = normalizeContractFieldStoredValue(f, raw)
    if (!normalized.ok) {
      throw Object.assign(new Error(normalized.message ?? 'sender 필드 저장 실패'), { statusCode: 400 })
    }
    const id = `cdv_${randomUUID()}`
    await client.query(
      `
      INSERT INTO liquor_signature_document_values (
        id, document_instance_id, field_id, field_key, field_type,
        value_text, value_file_id, value_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)
      `,
      [id, documentInstanceId, String(f.id), fk, String(f.field_type), normalized.valueText ?? ''],
    )
  }
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function parseSenderFieldValuesPayload(raw) {
  if (!raw || typeof raw !== 'object') {
    return {}
  }
  /** @type {Record<string, unknown>} */
  const out = {}
  for (const [k0, v] of Object.entries(/** @type {Record<string, unknown>} */ (raw))) {
    const k = String(k0).trim()
    if (!k || k.length > 200) continue
    out[k] = v
  }
  return out
}

/**
 * @param {unknown} senderRoot — nested by ct_* id 또는 단일 객체(평면 fieldKey 맵).
 * @param {string[]} liquorSignatureTemplateIds ct_ 포함 id
 */
export function senderValuesByLiquorSignatureTemplates(senderRoot, liquorSignatureTemplateIds) {
  /** @type {Map<string, Record<string, unknown>>} */
  const map = new Map()
  const ids = liquorSignatureTemplateIds.map((id) => String(id))
  for (const id of ids) {
    map.set(id, {})
  }
  if (!senderRoot || typeof senderRoot !== 'object') {
    return map
  }
  /** @type {Record<string, unknown>} */
  const root = /** @type {Record<string, unknown>} */ (senderRoot)
  const topKeys = Object.keys(root).filter((k) => typeof k === 'string' && k.startsWith('lst_'))
  if (topKeys.length > 0) {
    for (const id of ids) {
      map.set(id, parseSenderFieldValuesPayload(root[id] ?? root[String(id)]))
    }
    return map
  }
  const flat = parseSenderFieldValuesPayload(root)
  if (ids.length === 1) {
    map.set(ids[0], flat)
    return map
  }
  for (const id of ids) {
    map.set(id, { ...flat })
  }
  return map
}
