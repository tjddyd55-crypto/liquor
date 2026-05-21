/**
 * 전자서명 템플릿(ct_*)별 PDF 필드 입력 방식(customer / sender / fixed).
 * PDF 좌표 템플릿의 input_role 은 더 이상 신뢰하지 않고, 이 테이블이 최종 책임을 진다.
 */

import { listFields } from '../pdf-engine/repository/pdfTemplateRepo.js'
import { inputRoleFromPdfFieldRow } from '../pdf-engine/schema/inputRole.js'
import { normalizeContractFieldStoredValue } from './contractFieldValueNormalize.js'
import { randomUUID } from 'node:crypto'

/** @typedef {'customer' | 'sender' | 'fixed'} ContractFieldInputRole */

/**
 * @param {unknown} raw
 * @returns {ContractFieldInputRole}
 */
export function normalizeContractFieldInputRole(raw) {
  const k = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (k === 'sender' || k === 'fixed' || k === 'customer') {
    return k
  }
  if (k === 'disabled') {
    return 'fixed'
  }
  return 'customer'
}

/**
 * PDF 템플릿 필드 1행에서 계약 템플릿 설정 초기값을 만든다.
 * @param {{ field_type?: string, input_role?: string | null }} pdfRow
 * @returns {{ inputRole: ContractFieldInputRole, fixedValue: string | null }}
 */
export function seedRoleFromPdfFieldRow(pdfRow) {
  const ft = String(pdfRow?.field_type ?? '')
  if (ft === 'signature') {
    return { inputRole: 'customer', fixedValue: null }
  }
  const pdfRole = inputRoleFromPdfFieldRow(pdfRow)
  if (pdfRole === 'disabled') {
    return { inputRole: 'fixed', fixedValue: '' }
  }
  if (pdfRole === 'sender') {
    return { inputRole: 'sender', fixedValue: null }
  }
  return { inputRole: 'customer', fixedValue: null }
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} contractTemplateId
 * @returns {Promise<Map<string, { inputRole: ContractFieldInputRole, fixedValue: string | null }>>}
 */
export async function loadContractFieldSettingsMap(db, contractTemplateId) {
  const r = await db.query(
    `
    SELECT field_key, input_role, fixed_value
    FROM contract_template_field_settings
    WHERE template_id = $1
    `,
    [contractTemplateId],
  )
  /** @type {Map<string, { inputRole: ContractFieldInputRole, fixedValue: string | null }>} */
  const m = new Map()
  for (const row of r.rows) {
    const fk = String(row.field_key ?? '')
    if (!fk) continue
    m.set(fk, {
      inputRole: normalizeContractFieldInputRole(row.input_role),
      fixedValue: row.fixed_value == null ? null : String(row.fixed_value),
    })
  }
  return m
}

/**
 * 설정 행이 없을 때 PDF 행만으로 역할을 추정(레거시·누락 방어).
 * @param {object} pdfRow
 * @param {{ inputRole: ContractFieldInputRole, fixedValue: string | null } | undefined} setting
 * @returns {ContractFieldInputRole}
 */
export function effectiveContractFieldRole(pdfRow, setting) {
  if (setting) {
    const ft = String(pdfRow?.field_type ?? '')
    if (ft === 'signature') {
      return 'customer'
    }
    return normalizeContractFieldInputRole(setting.inputRole)
  }
  return seedRoleFromPdfFieldRow(pdfRow).inputRole
}

/**
 * 고객이 /values API로 텍스트·체크·라디오를 저장할 수 있는지.
 * @param {ContractFieldInputRole} role
 * @param {string} fieldType
 */
export function customerMayPostValuesForField(role, fieldType) {
  if (String(fieldType) === 'signature') {
    return false
  }
  return role === 'customer'
}

/**
 * 필수 검증·미리보기·스탬프에 포함할지(좌표 박스가 있는 PDF 필드는 값만 있으면 출력).
 * @param {ContractFieldInputRole} role
 */
export function roleParticipatesInRequiredCheck(role) {
  return role === 'customer' || role === 'sender' || role === 'fixed'
}

/**
 * @param {import('pg').Pool | import('pg').PoolClient} client
 * @param {string} contractTemplateId
 * @param {number} pdfTemplateId
 */
export async function seedContractTemplateFieldSettings(client, contractTemplateId, pdfTemplateId) {
  const fields = await listFields(client, pdfTemplateId)
  for (const f of fields) {
    const fk = String(f.field_key ?? '')
    if (!fk) continue
    const { inputRole, fixedValue } = seedRoleFromPdfFieldRow(f)
    await client.query(
      `
      INSERT INTO contract_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      ON CONFLICT (template_id, field_key) DO NOTHING
      `,
      [contractTemplateId, fk, inputRole, fixedValue],
    )
  }
}

/**
 * PDF 필드 저장 후: 해당 PDF를 쓰는 모든 계약 템플릿의 설정 행을 필드 키 집합에 맞게 정리한다.
 * @param {import('pg').Pool | import('pg').PoolClient} client
 * @param {number} pdfTemplateId
 */
export async function reconcileContractFieldSettingsAfterPdfSave(client, pdfTemplateId) {
  const fields = await listFields(client, pdfTemplateId)
  const keys = new Set(fields.map((f) => String(f.field_key)).filter(Boolean))
  const tr = await client.query(`SELECT id FROM contract_templates WHERE pdf_template_id = $1`, [pdfTemplateId])
  for (const row of tr.rows) {
    const tid = String(row.id)
    const keyArr = [...keys]
    if (keyArr.length === 0) {
      await client.query(`DELETE FROM contract_template_field_settings WHERE template_id = $1`, [tid])
      continue
    }
    await client.query(
      `DELETE FROM contract_template_field_settings WHERE template_id = $1 AND NOT (field_key = ANY($2::text[]))`,
      [tid, keyArr],
    )
    for (const f of fields) {
      const fk = String(f.field_key ?? '')
      if (!fk) continue
      const { inputRole, fixedValue } = seedRoleFromPdfFieldRow(f)
      await client.query(
        `
        INSERT INTO contract_template_field_settings (template_id, field_key, input_role, fixed_value, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NOW(), NOW())
        ON CONFLICT (template_id, field_key) DO NOTHING
        `,
        [tid, fk, inputRole, fixedValue],
      )
    }
  }
}

/**
 * active 전환·저장 시: fixed는 fixed_value 필수(공백 불가).
 * @param {import('pg').Pool | import('pg').PoolClient} db
 * @param {string} contractTemplateId
 * @param {number} pdfTemplateId
 * @returns {{ ok: boolean, message?: string }}
 */
export async function assertContractFieldSettingsValidForActivate(db, contractTemplateId, pdfTemplateId) {
  const pdfFields = await listFields(db, pdfTemplateId)
  const map = await loadContractFieldSettingsMap(db, contractTemplateId)
  for (const f of pdfFields) {
    const fk = String(f.field_key ?? '')
    const st = map.get(fk)
    const role = effectiveContractFieldRole(f, st)
    const ft = String(f.field_type ?? '')
    if (ft === 'signature' && role !== 'customer') {
      return { ok: false, message: '손사인 필드는 입력 방식이 고객 입력이어야 합니다.' }
    }
    if (role === 'fixed') {
      const fv = st?.fixedValue != null ? String(st.fixedValue).trim() : ''
      if (fv === '') {
        return {
          ok: false,
          message: `고정 출력 필드「${f.label ?? fk}」에 고정 출력값을 입력해 주세요.`,
        }
      }
    }
  }
  return { ok: true }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {string} documentInstanceId
 * @param {string} contractTemplateId
 * @param {number} pdfTemplateId
 */
export async function insertFixedPrefillDocumentValues(client, documentInstanceId, contractTemplateId, pdfTemplateId) {
  const pdfFields = await listFields(client, pdfTemplateId)
  const map = await loadContractFieldSettingsMap(client, contractTemplateId)
  for (const f of pdfFields) {
    const fk = String(f.field_key ?? '')
    const ft = String(f.field_type ?? '')
    if (ft === 'signature') continue
    const st = map.get(fk)
    const role = effectiveContractFieldRole(f, st)
    if (role !== 'fixed') continue
    const raw = st?.fixedValue ?? ''
    const normalized = normalizeContractFieldStoredValue(f, raw)
    if (!normalized.ok) {
      throw Object.assign(new Error(normalized.message ?? '고정 출력 값 저장 실패'), { statusCode: 400 })
    }
    const id = `cdv_${randomUUID()}`
    await client.query(
      `
      INSERT INTO contract_document_values (
        id, document_instance_id, field_id, field_key, field_type,
        value_text, value_file_id, value_hash
      )
      VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL)
      `,
      [id, documentInstanceId, String(f.id), fk, ft, normalized.valueText ?? ''],
    )
  }
}

/**
 * @param {object[]} pdfFieldRows
 * @param {Map<string, { inputRole: ContractFieldInputRole, fixedValue: string | null }>} settingsMap
 * @returns {{ fieldKey: string, label: string, required: boolean, fieldType: string, orderIndex: number, options: unknown }[]}
 */
export function listSenderFieldsForContractTemplate(pdfFieldRows, settingsMap) {
  /** @type {{ fieldKey: string, label: string, required: boolean, fieldType: string, orderIndex: number, options: unknown }[]} */
  const out = []
  for (const row of pdfFieldRows) {
    const ft = String(row.field_type ?? '')
    const fk = String(row.field_key ?? '')
    if (!fk || ft === 'signature') continue
    const role = effectiveContractFieldRole(row, settingsMap.get(fk))
    if (role !== 'sender') continue
    out.push({
      fieldKey: fk,
      label: row.label != null && String(row.label).trim() !== '' ? String(row.label) : fk,
      required: Boolean(row.required),
      fieldType: ft,
      orderIndex: Number(row.order_index) || 0,
      options: Array.isArray(row.options) ? row.options : null,
    })
  }
  out.sort((a, b) => a.orderIndex - b.orderIndex)
  return out
}
