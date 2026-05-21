/**
 * 정부지원 사업장 첨부 R2 object key (자료실·전자서명·보험 storage 와 분리).
 * @module governmentProfileFileStorage
 */
import { joinR2Key, stripR2ObjectRootIfPresent, withR2ObjectRoot } from '../r2KeyPolicy.js'

/**
 * @param {string} fileName
 */
export function sanitizeGovernmentProfileFileName(fileName) {
  const raw = String(fileName ?? '').trim() || 'file'
  return raw.replace(/[^\w.\-() \u3131-\u318e\uac00-\ud7a3]/g, '_').slice(0, 120)
}

/**
 * @param {{ ownerUserId: string, profileId: string|number, fileId: string|number, fileName: string }}
 */
export function buildGovernmentProfileFileObjectKey({ ownerUserId, profileId, fileId, fileName }) {
  const ownerSeg = String(ownerUserId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
  const safeName = sanitizeGovernmentProfileFileName(fileName)
  const relative = joinR2Key(
    'government',
    'profile-files',
    ownerSeg || '_',
    String(profileId),
    String(fileId),
    safeName,
  )
  return withR2ObjectRoot(relative)
}

/**
 * @param {string} objectKey
 * @param {{ ownerUserId: string, profileId: string|number, fileId: string|number }} expected
 */
export function assertGovernmentProfileFileObjectKey(objectKey, expected) {
  const key = stripR2ObjectRootIfPresent(String(objectKey ?? ''))
  const ownerSeg = String(expected.ownerUserId ?? '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 128)
  const prefix = joinR2Key(
    'government',
    'profile-files',
    ownerSeg || '_',
    String(expected.profileId),
    String(expected.fileId),
  )
  return key.startsWith(`${prefix}/`) || key === prefix
}
