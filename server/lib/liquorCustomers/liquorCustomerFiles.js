/**
 * liquor_customer_files 검증·매핑.
 * @module liquorCustomers/liquorCustomerFiles
 */

export const LIQUOR_CUSTOMER_FILE_MAX_BYTES = 25 * 1024 * 1024
export const LIQUOR_CUSTOMER_FILE_NAME_MAX = 120
export const LIQUOR_CUSTOMER_FILE_TITLE_MAX = 200
export const LIQUOR_CUSTOMER_FILE_MEMO_MAX = 2000

export const LIQUOR_CUSTOMER_FILE_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export const LIQUOR_CUSTOMER_FILE_BLOCKED_MIME = new Set([
  'application/x-msdownload',
  'application/x-sh',
  'text/html',
  'application/javascript',
  'text/javascript',
  'application/x-msdos-program',
  'application/x-executable',
])

export const LIQUOR_DOCUMENT_KINDS = new Set([
  'business_registration',
  'id_card',
  'liquor_license',
  'bankbook_copy',
  'support_contract',
  'loan_agreement',
  'goods_support_confirmation',
  'repayment_confirmation',
  'deposit_slip',
  'store_photo',
  'install_photo',
  'other',
])

const FILE_NAME_REGEX = /^[A-Za-z0-9._\-() \u3131-\u318e\uac00-\ud7a3]+$/

/**
 * @param {unknown} raw
 */
export function normalizeLiquorCustomerFileName(raw) {
  return String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, LIQUOR_CUSTOMER_FILE_NAME_MAX)
}

/**
 * @param {unknown} raw
 */
export function isValidLiquorCustomerFileName(raw) {
  const value = normalizeLiquorCustomerFileName(raw)
  return Boolean(value) && FILE_NAME_REGEX.test(value)
}

/**
 * @param {unknown} raw
 */
export function resolveLiquorCustomerFileContentType(raw) {
  return String(raw ?? '')
    .trim()
    .split(';')[0]
    .trim()
    .toLowerCase()
}

/**
 * @param {unknown} raw
 */
export function normalizeLiquorDocumentKind(raw) {
  const kind = String(raw ?? 'other').trim()
  return LIQUOR_DOCUMENT_KINDS.has(kind) ? kind : 'other'
}

/**
 * @param {Record<string, unknown>} row
 */
export function mapLiquorCustomerFileRow(row) {
  const createdAt = row.created_at ?? row.createdAt
  return {
    id: Number(row.id),
    customerId: Number(row.customer_id ?? row.customerId),
    supportContractId: row.support_contract_id != null ? Number(row.support_contract_id) : null,
    repaymentId: row.repayment_id != null ? Number(row.repayment_id) : null,
    supportItemId: row.support_item_id != null ? Number(row.support_item_id) : null,
    gaId: Number(row.ga_id ?? row.gaId),
    documentKind: String(row.document_kind ?? row.documentKind ?? 'other'),
    fileId: Number(row.file_id ?? row.fileId),
    title: String(row.title ?? ''),
    memo: String(row.memo ?? ''),
    uploadedByUserId: row.uploaded_by_user_id != null ? String(row.uploaded_by_user_id) : null,
    uploadedByName: String(row.uploaded_by_name ?? row.uploadedByName ?? ''),
    fileName: String(row.file_name ?? row.fileName ?? row.original_name ?? row.originalName ?? ''),
    originalName: String(row.original_name ?? row.originalName ?? row.file_name ?? ''),
    fileSize: Number(row.file_size ?? row.fileSize ?? 0),
    mimeType: String(row.mime_type ?? row.mimeType ?? ''),
    fileStatus: String(row.file_status ?? row.fileStatus ?? 'active'),
    createdAt:
      createdAt instanceof Date
        ? createdAt.toISOString()
        : createdAt != null
          ? String(createdAt)
          : new Date().toISOString(),
  }
}

/**
 * @param {Record<string, unknown>|null|undefined} body
 */
export function parseLiquorCustomerFileLinkIds(body) {
  const b = body ?? {}
  const linkTarget = String(b.linkTarget ?? b.link_target ?? 'customer').trim().toLowerCase()
  let supportContractId = b.supportContractId ?? b.support_contract_id ?? null
  let repaymentId = b.repaymentId ?? b.repayment_id ?? null
  let supportItemId = b.supportItemId ?? b.support_item_id ?? null

  if (linkTarget === 'support_contract') {
    supportContractId = supportContractId ?? b.targetId ?? b.target_id ?? null
    repaymentId = null
    supportItemId = null
  } else if (linkTarget === 'repayment') {
    repaymentId = repaymentId ?? b.targetId ?? b.target_id ?? null
    supportContractId = null
    supportItemId = null
  } else if (linkTarget === 'support_item') {
    supportItemId = supportItemId ?? b.targetId ?? b.target_id ?? null
    supportContractId = null
    repaymentId = null
  } else {
    supportContractId = null
    repaymentId = null
    supportItemId = null
  }

  const toId = (v) => {
    const n = Number(v)
    return Number.isInteger(n) && n > 0 ? n : null
  }

  return {
    linkTarget,
    supportContractId: toId(supportContractId),
    repaymentId: toId(repaymentId),
    supportItemId: toId(supportItemId),
  }
}
