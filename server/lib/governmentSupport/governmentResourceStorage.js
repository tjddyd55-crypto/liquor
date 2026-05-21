/**
 * 정부지원 자료실 R2 object key (유저 사업장 첨부와 분리).
 * @module governmentResourceStorage
 */
import { randomUUID } from 'node:crypto'
import { joinR2Key, stripR2ObjectRootIfPresent, withR2ObjectRoot } from '../r2KeyPolicy.js'
import { GOVERNMENT_SCOPE_GLOBAL } from './governmentOperationsConstants.js'

/**
 * @param {string} fileName
 */
export function sanitizeGovernmentResourceFileName(fileName) {
  const raw = String(fileName ?? '').trim() || 'file'
  return raw.replace(/[^\w.\-()\u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120)
}

/**
 * @param {{ tenantId?: string|null, resourceId: string|number, fileName: string, scopeType?: string }}
 */
export function buildGovernmentResourceObjectKey({ tenantId, resourceId, fileName, scopeType }) {
  const scope = String(scopeType ?? 'agency')
  const tenantSeg =
    scope === GOVERNMENT_SCOPE_GLOBAL || tenantId == null ? 'global' : String(tenantId)
  const safeName = sanitizeGovernmentResourceFileName(fileName)
  const relative = joinR2Key(
    'government',
    'resources',
    tenantSeg,
    String(resourceId),
    `${randomUUID()}_${safeName}`,
  )
  return withR2ObjectRoot(relative)
}

/**
 * @param {string} objectKey
 * @param {{ tenantId?: string|null, resourceId: string|number, scopeType?: string }} expected
 */
export function assertGovernmentResourceObjectKey(objectKey, expected) {
  const key = stripR2ObjectRootIfPresent(String(objectKey ?? ''))
  const scope = String(expected.scopeType ?? 'agency')
  const tenantSeg =
    scope === GOVERNMENT_SCOPE_GLOBAL || expected.tenantId == null
      ? 'global'
      : String(expected.tenantId)
  const prefix = joinR2Key('government', 'resources', tenantSeg, String(expected.resourceId))
  return key.startsWith(`${prefix}/`) || key === prefix
}
