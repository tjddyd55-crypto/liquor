/**
 * 주류 CRM 거래처 첨부 R2 object key (보험/정부 storage 와 분리).
 * @module liquorCustomers/liquorCustomerFileStorage
 */
import { joinR2Key, stripR2ObjectRootIfPresent, withR2ObjectRoot } from '../r2KeyPolicy.js'

/**
 * @param {string} fileName
 */
export function sanitizeLiquorCustomerFileName(fileName) {
  const raw = String(fileName ?? '').trim() || 'file'
  return raw.replace(/[^\w.\-() \u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120)
}

/**
 * @param {{ gaId: number|string, customerId: number|string, fileId: number|string, fileName: string }}
 */
export function buildLiquorCustomerFileObjectKey({ gaId, customerId, fileId, fileName }) {
  const safeName = sanitizeLiquorCustomerFileName(fileName)
  const relative = joinR2Key(
    'liquor',
    'customer-files',
    String(gaId),
    String(customerId),
    String(fileId),
    safeName,
  )
  return withR2ObjectRoot(relative)
}

/**
 * @param {string} objectKey
 * @param {{ gaId: number|string, customerId: number|string, fileId: number|string }} expected
 */
export function assertLiquorCustomerFileObjectKey(objectKey, expected) {
  const key = stripR2ObjectRootIfPresent(String(objectKey ?? ''))
  const prefix = joinR2Key(
    'liquor',
    'customer-files',
    String(expected.gaId),
    String(expected.customerId),
    String(expected.fileId),
  )
  return key.startsWith(`${prefix}/`) || key === prefix
}
