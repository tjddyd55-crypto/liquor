/**
 * 테넌트 경로에서 ga_id 조건 누락·바인딩 타입 문제를 완화합니다.
 * initDb·로그인·ga_companies 조회 등은 systemQuery를 사용하세요.
 *
 * 옵션:
 * - allowUnscoped: true 이면 SQL에 ga_id 문자열이 없어도 허용
 * - appendTenantGaFilter + tenantGaId: SQL에 ga_id가 없을 때만 AND/WHERE ga_id = $n::int 자동 삽입 (명시적 옵트인)
 * - coerceBindUndefined: true(기본) — undefined → null (Postgres 묵시 타입 추론 실패 완화)
 * - coerceIntegerLikeStrings: true — "42" 형태 문자열을 정수로 (ga_id 등; UUID·일반 텍스트는 건드리지 않음)
 * - lenient: true 또는 환경변수 LENIENT_DB_RESPONSES=1 — 쿼리 실패·스코프 위반 시 throw 대신 빈 결과 반환
 */

const LENIENT_ENV = process.env.LENIENT_DB_RESPONSES === '1'

/**
 * @param {unknown} v
 * @returns {number | null}
 */
function asPositiveIntOrNull(v) {
  const n = Number(v)
  return Number.isInteger(n) && n >= 1 ? n : null
}

/**
 * @param {unknown} p
 * @param {{ undefinedToNull: boolean, integerStrings: boolean }} opts
 */
function normalizeBindValue(p, opts) {
  const { undefinedToNull, integerStrings } = opts
  if (p === undefined && undefinedToNull) {
    return null
  }
  if (!integerStrings || p === null || p === undefined) {
    return p
  }
  if (typeof p === 'string') {
    const t = p.trim()
    if (t === '' || !/^-?\d+$/.test(t)) {
      return p
    }
    const n = Number(t)
    if (Number.isInteger(n) && n >= 1) {
      return n
    }
  }
  return p
}

/**
 * @param {unknown[]} values
 * @param {{ undefinedToNull?: boolean, coerceIntegerLikeStrings?: boolean }} [opts]
 * @returns {unknown[]}
 */
function mapBindParams(values, opts = {}) {
  const undefinedToNull = opts.undefinedToNull !== false
  const integerStrings = opts.coerceIntegerLikeStrings === true
  return values.map((p) => normalizeBindValue(p, { undefinedToNull, integerStrings }))
}

/**
 * @param {{ query: (text: string, params?: unknown[]) => Promise<unknown> }} executor Pool 또는 PoolClient
 * @param {string} text
 * @param {unknown[]|undefined} params
 * @param {{
 *   allowUnscoped?: boolean
 *   appendTenantGaFilter?: boolean
 *   tenantGaId?: unknown
 *   coerceBindUndefined?: boolean
 *   coerceIntegerLikeStrings?: boolean
 *   lenient?: boolean
 * }} [options]
 */
export async function safeQuery(executor, text, params, options = {}) {
  const {
    allowUnscoped = false,
    appendTenantGaFilter = false,
    tenantGaId = null,
    coerceBindUndefined = true,
    coerceIntegerLikeStrings = false,
    lenient: lenientOpt = false,
  } = options

  const lenient = LENIENT_ENV || lenientOpt === true

  let sql = String(text)
  let values = Array.isArray(params) ? [...params] : []

  values = mapBindParams(values, {
    undefinedToNull: coerceBindUndefined,
    coerceIntegerLikeStrings,
  })

  const tid = appendTenantGaFilter ? asPositiveIntOrNull(tenantGaId) : null
  if (appendTenantGaFilter && tid != null && !/\bga_id\b/i.test(sql)) {
    const hasWhere = /\bwhere\b/i.test(sql)
    const idx = values.length + 1
    sql = hasWhere ? `${sql} AND ga_id = $${idx}::int` : `${sql} WHERE ga_id = $${idx}::int`
    values.push(tid)
  }

  if (!allowUnscoped && !/\bga_id\b/i.test(sql)) {
    console.warn('[GA FILTER MISSING]', { sql: sql.slice(0, 800).trim() })
    const msg = `GA 필터 없는 쿼리 실행 금지: ${sql.slice(0, 200).trim()}`
    if (lenient) {
      if (LENIENT_ENV) {
        console.error('[LENIENT MODE DB ERROR]', {
          query: sql.slice(0, 2000),
          params: values,
          error: msg,
        })
      }
      console.error('[safeQuery] unscoped (lenient)', msg)
      return { rows: [], rowCount: 0, safeQueryError: true, safeQueryErrorKind: 'unscoped' }
    }
    throw new Error(msg)
  }

  try {
    return await executor.query(sql, values)
  } catch (error) {
    if (lenient) {
      const errMsg = error instanceof Error ? error.message : String(error)
      if (LENIENT_ENV) {
        console.error('[LENIENT MODE DB ERROR]', {
          query: sql.slice(0, 2000),
          params: values,
          error: errMsg,
        })
      } else {
        console.error('[SAFE QUERY ERROR]', {
          message: errMsg,
          sql: sql.slice(0, 400),
        })
      }
      return {
        rows: [],
        rowCount: 0,
        safeQueryError: true,
        safeQueryErrorKind: 'db',
        cause: error,
      }
    }
    throw error
  }
}

/** 마이그레이션, 로그인, GA 코드 조회 등 ga_id 컬럼이 없는 SQL 전용 */
export async function systemQuery(executor, text, params) {
  const values = mapBindParams(Array.isArray(params) ? params : [], {
    undefinedToNull: true,
    coerceIntegerLikeStrings: false,
  })
  return executor.query(String(text), values)
}
