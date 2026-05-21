import { consentGetBuffer } from '../lib/consentStorage.js'
import { getTemplateById, listFields } from '../pdf-engine/repository/pdfTemplateRepo.js'
import { stampPdf } from '../pdf-engine/renderer/stampPdf.js'
import { normalizeFieldSpec } from '../pdf-engine/schema/fieldSpec.js'
import { inputRoleExcludedFromPdfStamp, inputRoleFromPdfFieldRow } from '../pdf-engine/schema/inputRole.js'
import { getTemplateObject } from '../pdf-engine/storage/pdfTemplateStorage.js'
import {
  effectiveContractFieldRole,
  loadContractFieldSettingsMap,
} from './contractTemplateFieldSettings.js'
/**
 * DB pdf_template_fields 행 → FieldSpec (스탬프 전용 — 좌표만 쓰고 inputRole 은 customer 로 통일)
 * @param {object} row
 * @param {number} idx
 */
function rawFieldRowToSpec(row, idx) {
  return normalizeFieldSpec(
    {
      fieldKey: row.field_key,
      label: row.label,
      fieldType: row.field_type,
      required: row.required,
      orderIndex: row.order_index,
      inputRole: 'customer',
      customerMapping: null,
      options: Array.isArray(row.options) ? row.options : null,
      placements: Array.isArray(row.placements) ? row.placements : [],
    },
    row.order_index ?? idx,
  )
}

function shouldIncludeFieldForStamp(row, settingsMap) {
  if (!settingsMap) {
    return !inputRoleExcludedFromPdfStamp(inputRoleFromPdfFieldRow(row))
  }
  const fk = String(row.field_key ?? '')
  const eff = effectiveContractFieldRole(row, settingsMap.get(fk))
  return eff === 'customer' || eff === 'sender' || eff === 'fixed'
}

/**
 * 계약 문서 값 행과 템플릿 필드로 최종 스탬프 PDF 바이트를 생성한다.
 *
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number | string | null | undefined} pdfTemplateId
 * @param {Array<Record<string, unknown>>} valRows
 * @param {{ excludeSignatures?: boolean, contractTemplateId?: string | null }} [options]
 * @returns {Promise<Buffer>}
 */
export async function buildStampedPdfBufferFromInstance(executor, pdfTemplateId, valRows, options = {}) {
  const excludeSignatures = options.excludeSignatures === true
  const contractTemplateId =
    options.contractTemplateId != null && String(options.contractTemplateId).trim() !== ''
      ? String(options.contractTemplateId)
      : null
  const tid = pdfTemplateId == null ? NaN : Number(pdfTemplateId)
  if (!Number.isFinite(tid)) {
    throw new Error('pdf_template_id 가 없습니다.')
  }
  const rawFields = await listFields(executor, tid)
  /** @type {Map<string, { inputRole: import('./contractTemplateFieldSettings.js').ContractFieldInputRole, fixedValue: string | null }> | null} */
  let settingsMap = null
  if (contractTemplateId) {
    settingsMap = await loadContractFieldSettingsMap(executor, contractTemplateId)
  }
  const fields = rawFields
    .filter((row) => shouldIncludeFieldForStamp(row, settingsMap))
    .map((row, i) => rawFieldRowToSpec(row, i))
  const textValues = /** @type {Record<string, string>} */ ({})
  const signaturePngByFieldKey = /** @type {Record<string, Buffer>} */ ({})

  for (const row of valRows) {
    const fk = String(row.field_key ?? '')
    const ft = String(row.field_type ?? '')
    if (!fk) {
      continue
    }
    if (ft === 'signature') {
      if (excludeSignatures) {
        continue
      }
      const fid = row.value_file_id
      if (fid == null || String(fid).trim() === '') {
        continue
      }
      const fr = await executor.query(`SELECT file_path FROM files WHERE id = $1 LIMIT 1`, [String(fid)])
      const storageKey = fr.rows[0]?.file_path
      if (!storageKey) {
        continue
      }
      const buf = await consentGetBuffer(String(storageKey))
      if (buf && buf.length > 0) {
        signaturePngByFieldKey[fk] = Buffer.from(buf)
      }
      continue
    }
    textValues[fk] = row.value_text == null ? '' : String(row.value_text)
  }

  const tpl = await getTemplateById(executor, tid)
  if (!tpl?.storage_key) {
    throw new Error('PDF 템플릿 스토리지 키가 없습니다.')
  }
  const templateBytes = await getTemplateObject(String(tpl.storage_key))
  return stampPdf(templateBytes, fields, textValues, signaturePngByFieldKey)
}
