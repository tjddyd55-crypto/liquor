/**
 * PDF 템플릿 원본 파일 스토리지 어댑터.
 *
 * 구현은 기존 consentStorage 의 R2 헬퍼를 그대로 재사용한다:
 *  - 환경변수가 모두 있으면 R2(S3 호환), 없으면 로컬 파일시스템 폴백.
 *  - 이 어댑터는 "key prefix" 와 "presign 옵션" 만 달리해 그 위에 얇게 쓴다.
 *
 * 이유: 같은 스토리지를 두 군데서 다르게 다루면 환경변수 분기/장애 원인이 2배가 된다.
 * consentStorage 가 원수사 소식지·동의서 모두를 이미 관리하므로, PDF 엔진도 같은
 * 경로를 공유하고 prefix 만 다르게 둔다.
 */

import { randomUUID } from 'node:crypto'
import {
  consentGetBuffer,
  consentPutObject,
  r2DeleteStorageObjectOrThrow,
  r2GetPresignedPutUrl,
} from '../../lib/consentStorage.js'

const KEY_PREFIX = 'pdf-templates'

/**
 * 관리자 업로드용 객체 key 를 생성한다. 같은 파일을 재업로드해도 캐시 문제가 없도록
 * UUID 를 섞어 새 객체로 저장한다(이전 객체는 별도 정리 유틸로 처리).
 *
 * @param {object} input
 * @param {number | null} input.gaId
 * @param {string} input.code
 */
export function buildTemplateStorageKey({ gaId, code }) {
  const ga = gaId == null ? 'shared' : `ga-${gaId}`
  const safeCode = String(code).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-') || 'doc'
  return `${KEY_PREFIX}/${ga}/${safeCode}-${randomUUID()}.pdf`
}

/**
 * 클라이언트에서 PDF 를 직접 업로드할 presigned PUT URL 을 반환한다.
 * 템플릿 PDF 는 공개 CDN 이 아니라 서버 경유 다운로드만 허용하므로,
 * 장기 캐시 Cache-Control 을 설정하지 않는다.
 *
 * @param {string} key
 * @param {string} contentType
 */
export function getTemplateUploadUrl(key, contentType) {
  return r2GetPresignedPutUrl(key, contentType || 'application/pdf', 900, { cacheControl: null })
}

/**
 * 버퍼를 직접 PUT 한다(관리자 폼이 multipart 로 올린 경우).
 * @param {string} key
 * @param {Buffer} body
 */
export function putTemplateObject(key, body) {
  return consentPutObject(key, body, 'application/pdf')
}

/**
 * 객체를 서버에서 읽어온다. 렌더링 시점에 원본 PDF 를 가져올 때 사용한다.
 * @param {string} key
 * @returns {Promise<Buffer>}
 */
export function getTemplateObject(key) {
  return consentGetBuffer(key)
}

/**
 * 객체 삭제(멱등). 템플릿 삭제 API 에서 DB 제거 전에 호출한다.
 * @param {string} key
 */
export function deleteTemplateObject(key) {
  return r2DeleteStorageObjectOrThrow(key)
}
