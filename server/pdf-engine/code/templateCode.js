/**
 * 템플릿 `code` 자동 생성 정책.
 *
 * 왜 별도 파일인가:
 *   `code` 는 사용자 관점의 식별자에서 내부 식별자로 격하됐다. 그래서 "어떻게
 *   만드는지" 가 비즈니스 규칙이 되고, 규칙은 한 곳에만 살아야 한다(정책 변경이
 *   라우터 전반으로 새는 걸 막기 위함). 라우터는 이 모듈의 시그니처만 호출한다.
 *
 * 규칙:
 *   1) title 에서 ASCII slug 를 뽑는다. 한글만 있어 slug 가 비면 `doc` 로 대체.
 *   2) base code 그대로 INSERT 시도. DB unique 제약(23505) 이면 `-2`, `-3`, … 접미어.
 *   3) 접미어 재시도가 N 회 모두 실패하면 `base-<shortUuid>` 로 한 번 더 시도.
 *      (경쟁 삽입이 비정상적으로 많아지는 병적 상황에 대한 안전망.)
 *   4) `createTemplateWithAutoCode` 는 "삽입 성공한 row" 를 그대로 반환한다.
 *      호출측은 code 를 미리 결정해 둘 필요가 없다.
 *
 * 왜 base = 'doc' fallback 인가:
 *   - 한글 제목이 일반적인 환경에서 slug 가 전부 비어있을 수 있다.
 *   - 사람에게 보이지 않는 식별자이므로 "의미 있는 영문" 보다 "짧고 예측 가능한"
 *     시드가 운영에 유리하다. 의미 부여는 title 이 담당한다.
 */

import { randomUUID } from 'node:crypto'

/** 유일성 재시도 횟수. 이 값이 크면 code 가 길어질 수 있으므로 작은 범위로 고정. */
const COLLISION_RETRY_LIMIT = 20

/** DB unique 위반 코드(Postgres). 이 값 외에는 자동 재시도하지 않는다. */
const POSTGRES_UNIQUE_VIOLATION = '23505'

/**
 * 기본 slug 후보를 산출한다.
 *
 * @param {string} title
 * @returns {string}
 */
export function deriveBaseCodeFromTitle(title) {
  const normalized =
    typeof title === 'string'
      ? title
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 40)
      : ''
  if (normalized) return normalized
  return `doc-${randomUUID().slice(0, 8)}`
}

/**
 * 충돌 재시도를 포함한 템플릿 생성.
 *
 * @param {import('pg').Pool} pool
 * @param {(pool: import('pg').Pool, input: object) => Promise<object>} insertOnce
 *   `createTemplate` 과 동일한 시그니처의 함수. 테스트 용이성을 위해 주입.
 * @param {{
 *   gaId: number | null,
 *   title: string,
 *   description: string,
 *   storageKey: string,
 *   pageCount: number,
 *   createdByUserId: string | null,
 * }} input
 * @returns {Promise<object>} 삽입 성공한 row
 */
export async function createTemplateWithAutoCode(pool, insertOnce, input) {
  const base = deriveBaseCodeFromTitle(input.title)

  /* 순차 재시도: base, base-2, ..., base-(LIMIT).
     각 시도는 독립 INSERT 라 동시성 환경에서도 DB unique 제약이 최종 진실이다. */
  for (let attempt = 0; attempt <= COLLISION_RETRY_LIMIT; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    try {
      return await insertOnce(pool, { ...input, code: candidate })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      /* 다음 후보로 넘어감. */
    }
  }

  /* 모든 접미어가 충돌한 예외적 상황 — 더 이상 예측 가능한 값으로는 승부 못 냄.
     운영 추적을 위해 로그는 남기지만, 요청을 실패시키지 않고 마지막 한 번만 더 시도. */
  const salvage = `${base}-${randomUUID().slice(0, 8)}`
  console.warn('[pdf-templates] code 자동 생성 재시도 한계 도달, salvage 시도', {
    base,
    salvage,
  })
  return insertOnce(pool, { ...input, code: salvage })
}

function isUniqueViolation(error) {
  return Boolean(
    error && typeof error === 'object' && /** @type {{code?: string}} */ (error).code === POSTGRES_UNIQUE_VIOLATION,
  )
}
