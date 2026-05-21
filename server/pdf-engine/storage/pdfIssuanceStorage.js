/**
 * 발급된 PDF 보관용 스토리지 어댑터.
 *
 * 원본 템플릿 스토리지와 같은 R2/로컬 폴백 파이프라인을 공유하되,
 * 버킷 내 key prefix 를 구분해 라이프사이클 정책(예: 90일 보존) 을 독립 적용할 수 있게 한다.
 *
 * 경로 규칙: pdf-issuances/<YYYY>/<MM>/<uuid>.pdf
 *   - 연/월 파티션: 대량 발급 시 단일 접두어 아래 객체가 쌓이는 것을 피하고,
 *     보관 기간이 지난 월을 폴더 단위로 수집/삭제하기 쉽게 한다.
 *   - UUID: 충돌 회피 + 추측 방지.
 */

import { randomUUID } from 'node:crypto'
import {
  consentGetBuffer,
  consentPutObject,
  r2DeleteStorageObjectOrThrow,
} from '../../lib/consentStorage.js'

const KEY_PREFIX = 'pdf-issuances'

/**
 * 발급 이력 저장용 key.
 * @param {Date} [now] 기본값은 현재 시각. 테스트에서 주입 가능.
 * @returns {string}
 */
export function buildIssuanceStorageKey(now = new Date()) {
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${KEY_PREFIX}/${y}/${m}/${randomUUID()}.pdf`
}

/**
 * @param {string} key
 * @param {Buffer} body
 */
export function putIssuanceObject(key, body) {
  return consentPutObject(key, body, 'application/pdf')
}

/**
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export function getIssuanceObject(key) {
  return consentGetBuffer(key)
}

/**
 * 이력 삭제는 당장 노출하지 않지만, 보관 기간 정책 스크립트에서 쓸 수 있게 열어 둔다.
 * @param {string} key
 */
export function deleteIssuanceObject(key) {
  return r2DeleteStorageObjectOrThrow(key)
}
