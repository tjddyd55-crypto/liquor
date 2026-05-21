import multer from 'multer'
import * as XLSX from 'xlsx'
import { safeQuery, systemQuery } from '../utils/dbSafeQuery.js'
import {
  listGaCustomerMatchAliases,
  normalizeGaExactMatchValue,
} from '../lib/gaCustomerMatchAliases.js'

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
})

const ALLOWED_MATCH_DB_FIELDS = new Set(['name', 'birth_date', 'ssn', 'phone'])

function parseGaIdParam(raw) {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 ? n : null
}

function cellToString(v) {
  if (v == null) {
    return ''
  }
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v).trim()
}

/** DB 저장·화면 표시용. 셀 문자열은 trim 하지 않고 보관한다(조회 시에만 정규화). */
function excelCellToStoredString(v) {
  if (v == null || v === '') {
    return ''
  }
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(v)
}

function normalizeNameForMatch(v) {
  return String(v ?? '').trim()
}

function normalizeSsn(v) {
  return String(v ?? '')
    .replace(/[^0-9]/g, '')
    .trim()
}

function normalizePhone(v) {
  return String(v ?? '').replace(/[^0-9]/g, '')
}

function extractBirthDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '')
}

/**
 * 생년월일: 6자리(YYMMDD) / 8자리(YYYYMMDD) 혼용.
 * 한쪽만 8자리인 경우 양쪽 모두 뒤 6자리(YYMMDD)로 비교한다.
 */
function parseBirthComparable(raw) {
  const d = extractBirthDigits(raw)
  if (d.length < 6) {
    return null
  }
  if (d.length >= 8) {
    const y8 = d.slice(0, 8)
    return { y8, y6: y8.slice(2, 8) }
  }
  return { y8: null, y6: d.slice(-6) }
}

function birthComparableEquals(aRaw, bRaw) {
  const a = parseBirthComparable(aRaw)
  const b = parseBirthComparable(bRaw)
  if (!a || !b) {
    return false
  }
  if (a.y8 && b.y8) {
    return a.y8 === b.y8
  }
  if (a.y8 && !b.y8) {
    return a.y6 === b.y6
  }
  if (!a.y8 && b.y8) {
    return a.y6 === b.y6
  }
  return a.y6 === b.y6
}

function customerBirthRawForMatch(row) {
  const bd = row.birth_date
  if (bd instanceof Date) {
    const y = bd.getFullYear()
    const m = String(bd.getMonth() + 1).padStart(2, '0')
    const d = String(bd.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(bd ?? '')
}

function getCustomerNormalizedField(row, dbField) {
  if (dbField === 'name') {
    return normalizeNameForMatch(row.name ?? '')
  }
  if (dbField === 'ssn') {
    return normalizeSsn(row.ssn ?? '')
  }
  if (dbField === 'phone') {
    return normalizePhone(row.phone ?? '')
  }
  if (dbField === 'birth_date') {
    return customerBirthRawForMatch(row)
  }
  return ''
}

function getExcelCellNormalized(cells, columnId, dbField) {
  const raw = cells[columnId]
  const s = raw == null ? '' : String(raw)
  if (dbField === 'ssn') {
    return normalizeSsn(s)
  }
  if (dbField === 'phone') {
    return normalizePhone(s)
  }
  if (dbField === 'birth_date') {
    return s
  }
  return normalizeNameForMatch(s)
}

/**
 * 첫 시트, 첫 행 헤더 → col_0… 안정 id 부여
 * @param {Buffer} buffer
 */
function headerCellToLabel(h, index) {
  if (h == null || h === '') {
    return `열 ${index + 1}`
  }
  if (h instanceof Date) {
    const y = h.getFullYear()
    const m = String(h.getMonth() + 1).padStart(2, '0')
    const d = String(h.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return String(h).trim() || `열 ${index + 1}`
}

function parseExcelSampleToColumnsAndRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    throw new Error('EMPTY_WORKBOOK')
  }
  const sheet = wb.Sheets[sheetName]
  const matrixRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true })
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('EMPTY_SHEET')
  }
  const headerRow = Array.isArray(matrixRaw[0]) ? matrixRaw[0] : matrix[0]
  if (!Array.isArray(headerRow)) {
    throw new Error('BAD_HEADER')
  }
  const columns = headerRow.map((h, index) => ({
    id: `col_${index}`,
    header: headerCellToLabel(h, index),
    index,
  }))
  const dataRows = []
  for (let i = 1; i < matrix.length; i++) {
    const arr = matrix[i]
    const cells = {}
    let any = false
    for (let j = 0; j < columns.length; j++) {
      const v = Array.isArray(arr) ? arr[j] : undefined
      const str = excelCellToStoredString(v)
      cells[columns[j].id] = str
      if (str.trim()) {
        any = true
      }
    }
    if (any) {
      dataRows.push({ rowIndex: i + 1, cells })
    }
  }
  return { columns, dataRows }
}

function parseJsonArray(raw, fallback = []) {
  if (raw == null) {
    return fallback
  }
  if (Array.isArray(raw)) {
    return raw
  }
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      return Array.isArray(v) ? v : fallback
    } catch {
      return fallback
    }
  }
  return fallback
}

function columnIdSet(columns) {
  return new Set(columns.map((c) => c.id))
}

/** @param {{ id: string, header: string }[]} sampleColumns */
function resolveSampleColumnId(sampleColumns, raw) {
  const s = String(raw ?? '').trim()
  if (!s) {
    return null
  }
  if (sampleColumns.some((c) => c.id === s)) {
    return s
  }
  const hit = sampleColumns.find((c) => c.header === s)
  return hit ? hit.id : null
}

function blockNonDesignerExcelUser(req, res) {
  const role = String(req.user?.role ?? '')
  if (role === 'SUPER_ADMIN' || role === 'INSURER_MANAGER' || role === 'LOSS_ADJUSTER') {
    res.status(403).json({ message: '이 기능은 GA 설계사 계정에서만 사용할 수 있습니다.' })
    return true
  }
  return false
}

function rowMatchesCustomer(cells, matchRules, customerRow, options = {}) {
  const aliasValues = Array.isArray(options.aliasValues) ? options.aliasValues : []
  const customerNameExact = normalizeGaExactMatchValue(customerRow.name ?? '')
  const nameExactMatchSet = new Set()
  if (customerNameExact) {
    nameExactMatchSet.add(customerNameExact)
  }
  for (const alias of aliasValues) {
    const n = normalizeGaExactMatchValue(alias)
    if (n && n !== customerNameExact) {
      nameExactMatchSet.add(n)
    }
  }

  for (const rule of matchRules) {
    const colId = String(rule.columnId ?? '').trim()
    const dbField = String(rule.dbField ?? '').trim()
    if (!colId || !ALLOWED_MATCH_DB_FIELDS.has(dbField)) {
      return false
    }
    const excelNorm = getExcelCellNormalized(cells, colId, dbField)
    const dbNorm = getCustomerNormalizedField(customerRow, dbField)
    if (dbField === 'birth_date') {
      if (excelNorm === '' || dbNorm === '' || !birthComparableEquals(excelNorm, dbNorm)) {
        return false
      }
      continue
    }
    if (dbField === 'name') {
      if (excelNorm === '' || !nameExactMatchSet.has(excelNorm)) {
        return false
      }
      continue
    }
    if (excelNorm === '' || dbNorm === '' || excelNorm !== dbNorm) {
      return false
    }
  }
  return matchRules.length > 0
}

function mapSettingsRow(row) {
  const sampleColumns = parseJsonArray(row.sample_columns, [])
  const matchRules = parseJsonArray(row.match_rules, [])
  return {
    gaId: Number(row.ga_id),
    featureEnabled: Boolean(row.feature_enabled),
    configReady: computeConfigReady(sampleColumns, matchRules),
    sampleOriginalFilename: row.sample_original_filename != null ? String(row.sample_original_filename) : '',
    sampleUploadedAt: row.sample_uploaded_at,
    sampleColumns,
    matchRules,
    displayColumnIds: [],
    updatedAt: row.updated_at,
    settingsVersion: Number(row.settings_version ?? 1),
    matchRuleCount: matchRules.length,
    displayColumnCount: 0,
  }
}

async function ensureSettingsRow(client, gaId) {
  await safeQuery(
    client,
    `
    INSERT INTO ga_customer_excel_settings (ga_id)
    VALUES ($1)
    ON CONFLICT (ga_id) DO NOTHING
    `,
    [gaId],
  )
}

async function loadSettingsOrDefault(pool, gaId) {
  const r = await safeQuery(
    pool,
    `SELECT * FROM ga_customer_excel_settings WHERE ga_id = $1 LIMIT 1`,
    [gaId],
  )
  if (r.rowCount === 0) {
    return {
      gaId,
      featureEnabled: false,
      configReady: false,
      sampleOriginalFilename: '',
      sampleUploadedAt: null,
      sampleColumns: [],
      matchRules: [],
      displayColumnIds: [],
      updatedAt: null,
      settingsVersion: 0,
      matchRuleCount: 0,
      displayColumnCount: 0,
    }
  }
  return mapSettingsRow(r.rows[0])
}

function computeConfigReady(sampleColumns, matchRules) {
  const colIds = columnIdSet(sampleColumns)
  if (sampleColumns.length === 0) {
    return false
  }
  if (!Array.isArray(matchRules) || matchRules.length === 0) {
    return false
  }
  for (const m of matchRules) {
    const cid = String(m.columnId ?? '').trim()
    const db = String(m.dbField ?? '').trim()
    if (!cid || !colIds.has(cid) || !ALLOWED_MATCH_DB_FIELDS.has(db)) {
      return false
    }
  }
  return true
}

async function loadUserColumnVisibilityMap(pool, userId, gaId) {
  const r = await safeQuery(
    pool,
    `
    SELECT column_name, is_visible
    FROM user_excel_column_settings
    WHERE user_id = $1 AND ga_id = $2
    `,
    [userId, gaId],
  )
  const map = new Map()
  for (const row of r.rows) {
    map.set(String(row.column_name), Boolean(row.is_visible))
  }
  return map
}

function buildVisibleColumnOrder(sampleColumns, visibilityMap) {
  const displayColumnIds = []
  const displayHeaders = []
  for (const c of sampleColumns) {
    const vis = visibilityMap.get(c.id)
    const isVisible = vis === undefined ? true : vis
    if (!isVisible) {
      continue
    }
    displayColumnIds.push(c.id)
    displayHeaders.push(c.header)
  }
  return { displayColumnIds, displayHeaders }
}

function stringifyExcelCellMap(rawCells) {
  const cells = typeof rawCells === 'object' && rawCells != null ? rawCells : {}
  const out = {}
  for (const [k, v] of Object.entries(cells)) {
    out[String(k)] = v == null ? '' : String(v)
  }
  return out
}

/** 표시 열이 비었을 때 row_data 키 정렬 (고정 col_n·헤더 문자열 혼재) */
function sortGaFallbackColumnIds(ids) {
  const prioritySubstrings = [
    'name',
    'customer',
    '고객',
    '이름',
    'phone',
    'mobile',
    'tel',
    '연락',
    '휴대',
    'birth',
    '생년',
    'company',
    '보험사',
    'insurer',
    'product',
    '상품',
    'premium',
    '보험료',
    'contract',
    '계약',
    'status',
    '상태',
  ]
  const score = (id) => {
    const s = String(id).toLowerCase()
    let best = prioritySubstrings.length
    for (let i = 0; i < prioritySubstrings.length; i += 1) {
      const p = prioritySubstrings[i]
      if (s.includes(p.toLowerCase())) {
        best = Math.min(best, i)
      }
    }
    return best
  }
  return [...new Set(ids)].sort((a, b) => {
    const da = score(a) - score(b)
    if (da !== 0) return da
    return String(a).localeCompare(String(b), 'ko')
  })
}

/**
 * 로그인 유저의 GA 엑셀 데이터와 고객을 매칭한 조회 페이로드 생성
 * @returns {Promise<{ status: number, body: object }>}
 */
async function buildUserGaExcelCustomerPayload(pool, { userId, gaId, customerId }) {
  const settings = await loadSettingsOrDefault(pool, gaId)
  if (!settings.featureEnabled || !settings.configReady) {
    return {
      status: 403,
      body: { message: 'GA 엑셀 설정이 필요합니다' },
    }
  }

  const cust = await safeQuery(
    pool,
    `
    SELECT id, user_id, ga_id, name, ssn, birth_date, phone
    FROM customers
    WHERE id = $1 AND user_id = $2 AND ga_id = $3 AND deleted_at IS NULL
    LIMIT 1
    `,
    [customerId, userId, gaId],
  )
  if (cust.rowCount === 0) {
    return { status: 404, body: { message: '고객을 찾을 수 없습니다.' } }
  }
  const customerRow = cust.rows[0]

  const visibilityMap = await loadUserColumnVisibilityMap(pool, userId, gaId)
  let { displayColumnIds, displayHeaders } = buildVisibleColumnOrder(settings.sampleColumns, visibilityMap)

  const rowsRes = await safeQuery(
    pool,
    `
    SELECT row_index, row_data
    FROM user_excel_data
    WHERE user_id = $1 AND ga_id = $2
    ORDER BY row_index ASC, id ASC
    `,
    [userId, gaId],
  )

  const matchRules = settings.matchRules
  const aliasValues = await listGaCustomerMatchAliases(pool, gaId, customerId)
  const sourceRowCount = rowsRes.rows.length

  if (sourceRowCount === 0) {
    return {
      status: 200,
      body: {
        displayHeaders,
        displayColumnIds,
        rows: [],
        sourceRowCount: 0,
        message: '업로드된 고객 데이터가 없습니다',
        displayColumnFallback: false,
      },
    }
  }

  const matchedFullRows = []
  for (const r of rowsRes.rows) {
    const cells = stringifyExcelCellMap(r.row_data)
    if (!rowMatchesCustomer(cells, matchRules, customerRow, { aliasValues })) {
      continue
    }
    matchedFullRows.push({ rowIndex: Number(r.row_index), cells })
  }

  let displayColumnFallback = false
  if (displayColumnIds.length === 0 && matchedFullRows.length > 0) {
    displayColumnFallback = true
    if (settings.sampleColumns.length > 0) {
      displayColumnIds = settings.sampleColumns.map((c) => String(c.id))
      displayHeaders = settings.sampleColumns.map((c) => String(c.header))
    } else {
      const keySet = new Set()
      for (const mr of matchedFullRows) {
        for (const k of Object.keys(mr.cells)) {
          keySet.add(k)
        }
      }
      displayColumnIds = sortGaFallbackColumnIds([...keySet])
      displayHeaders = displayColumnIds.map((id) => String(id))
    }
  }

  const outRows = []
  for (const mr of matchedFullRows) {
    const displayCells = {}
    for (let i = 0; i < displayColumnIds.length; i += 1) {
      const colId = String(displayColumnIds[i])
      const v = mr.cells[colId]
      displayCells[colId] = v == null ? '' : String(v)
    }
    outRows.push({ rowIndex: mr.rowIndex, cells: displayCells })
  }

  let message = ''
  if (matchedFullRows.length === 0) {
    message = '매칭되는 행이 없습니다.'
  }

  return {
    status: 200,
    body: {
      displayHeaders,
      displayColumnIds,
      rows: outRows,
      sourceRowCount,
      message,
      displayColumnFallback,
    },
  }
}
export function registerGaCustomerExcelApi(apiRouter, ctx) {
  const { pool, requireAuth, requireSuperAdmin, handleDbError, parseGaId, requireInsuranceFormUserId } = ctx

  /** 슈퍼 관리자: 설정 조회 */
  apiRouter.get('/admin/ga/:gaId/customer-excel/settings', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const gaId = parseGaIdParam(req.params.gaId)
      if (gaId == null) {
        res.status(400).json({ message: '잘못된 GA ID입니다.' })
        return
      }
      const g = await systemQuery(pool, `SELECT id FROM ga_companies WHERE id = $1 AND is_deleted = false LIMIT 1`, [
        gaId,
      ])
      if (g.rowCount === 0) {
        res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
        return
      }
      const settings = await loadSettingsOrDefault(pool, gaId)
      res.json(settings)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  /** 슈퍼 관리자: 샘플 엑셀 업로드 → 컬럼 분석만 반영 (저장 확정은 PUT) */
  apiRouter.post(
    '/admin/ga/:gaId/customer-excel/sample',
    requireAuth,
    requireSuperAdmin,
    uploadExcel.single('file'),
    async (req, res) => {
      try {
        const gaId = parseGaIdParam(req.params.gaId)
        if (gaId == null) {
          res.status(400).json({ message: '잘못된 GA ID입니다.' })
          return
        }
        const g = await systemQuery(pool, `SELECT id FROM ga_companies WHERE id = $1 AND is_deleted = false LIMIT 1`, [
          gaId,
        ])
        if (g.rowCount === 0) {
          res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
          return
        }
        const file = req.file
        if (!file?.buffer) {
          res.status(400).json({ message: '엑셀 파일을 선택해 주세요.' })
          return
        }
        const orig = String(file.originalname ?? 'sample.xlsx')
        const lower = orig.toLowerCase()
        if (!lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
          res.status(400).json({ message: 'xlsx 또는 xls 파일만 업로드할 수 있습니다.' })
          return
        }
        let columns
        try {
          ;({ columns } = parseExcelSampleToColumnsAndRows(file.buffer))
        } catch (err) {
          const code = err instanceof Error ? err.message : 'PARSE_ERROR'
          res.status(400).json({ message: '엑셀을 읽을 수 없습니다.', code })
          return
        }
        if (columns.length === 0) {
          res.status(400).json({ message: '헤더 행을 찾을 수 없습니다.' })
          return
        }

        const client = await pool.connect()
        try {
          await client.query('BEGIN')
          await ensureSettingsRow(client, gaId)
          await safeQuery(
            client,
            `
            UPDATE ga_customer_excel_settings
            SET sample_original_filename = $2,
                sample_uploaded_at = NOW(),
                sample_columns = CAST($3 AS jsonb)::jsonb,
                config_ready = false,
                updated_at = NOW()
            WHERE ga_id = $1
            `,
            [gaId, orig, JSON.stringify(columns)],
          )
          await client.query('COMMIT')
        } catch (e) {
          try {
            await client.query('ROLLBACK')
          } catch {
            /* ignore */
          }
          throw e
        } finally {
          client.release()
        }

        const settings = await loadSettingsOrDefault(pool, gaId)
        res.json({ ok: true, sampleColumns: columns, settings })
      } catch (e) {
        handleDbError(e, req, res)
      }
    },
  )

  /** 슈퍼 관리자: ON/OFF·매핑·표시 저장 */
  apiRouter.put('/admin/ga/:gaId/customer-excel/settings', requireAuth, requireSuperAdmin, async (req, res) => {
    try {
      const gaId = parseGaIdParam(req.params.gaId)
      if (gaId == null) {
        res.status(400).json({ message: '잘못된 GA ID입니다.' })
        return
      }
      const g = await systemQuery(pool, `SELECT id FROM ga_companies WHERE id = $1 AND is_deleted = false LIMIT 1`, [
        gaId,
      ])
      if (g.rowCount === 0) {
        res.status(404).json({ message: 'GA를 찾을 수 없습니다.' })
        return
      }

      const body = req.body ?? {}
      const featureEnabled = Boolean(body.featureEnabled ?? body.feature_enabled)
      const matchRules = Array.isArray(body.matchRules) ? body.matchRules : []

      const client = await pool.connect()
      try {
        await ensureSettingsRow(client, gaId)
        const cur = await safeQuery(client, `SELECT * FROM ga_customer_excel_settings WHERE ga_id = $1`, [gaId])
        const row = cur.rows[0]
        const sampleColumns = parseJsonArray(row.sample_columns, [])

        if (sampleColumns.length === 0 && (featureEnabled || matchRules.length > 0)) {
          res.status(400).json({ message: '먼저 샘플 엑셀을 업로드해 주세요.' })
          return
        }

        const colIds = columnIdSet(sampleColumns)
        const cleanedMatch = []
        for (const m of matchRules) {
          const columnId = String(m.columnId ?? m.excelColumnId ?? '').trim()
          const dbField = String(m.dbField ?? '').trim()
          if (!columnId || !dbField) {
            continue
          }
          if (sampleColumns.length > 0 && (!colIds.has(columnId) || !ALLOWED_MATCH_DB_FIELDS.has(dbField))) {
            res.status(400).json({ message: '조회 기준 컬럼 매핑이 올바르지 않습니다.' })
            return
          }
          cleanedMatch.push({ columnId, dbField })
        }

        if (featureEnabled && cleanedMatch.length === 0) {
          res.status(400).json({ message: '조회 기준 컬럼을 최소 1개 이상 지정해야 합니다.' })
          return
        }

        const configReady = computeConfigReady(sampleColumns, cleanedMatch)

        await client.query('BEGIN')
        await safeQuery(
          client,
          `
          UPDATE ga_customer_excel_settings
          SET feature_enabled = $2,
              match_rules = CAST($3 AS jsonb)::jsonb,
              display_column_ids = '[]'::jsonb,
              filter_column_id = NULL,
              filter_op = NULL,
              filter_value = NULL,
              config_ready = $4,
              settings_version = settings_version + 1,
              updated_at = NOW()
          WHERE ga_id = $1
          `,
          [gaId, featureEnabled, JSON.stringify(cleanedMatch), configReady],
        )
        await client.query('COMMIT')
        const settings = await loadSettingsOrDefault(pool, gaId)
        res.json({ ok: true, settings })
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw e
      } finally {
        client.release()
      }
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  /** 설계사: 기능 노출 여부 (프론트는 이 값만 신뢰) */
  apiRouter.get('/ga-customer-excel/capability', requireAuth, async (req, res) => {
    try {
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.json({
          gaId: null,
          featureEnabled: false,
          configReady: false,
          showDesignerUi: false,
          message: 'GA 컨텍스트가 없습니다.',
        })
        return
      }
      const settings = await loadSettingsOrDefault(pool, gaId)
      const showDesignerUi = Boolean(settings.featureEnabled && settings.configReady)
      let message = ''
      if (!settings.featureEnabled) {
        message = ''
      } else if (!settings.configReady) {
        message = '이 GA는 고객 엑셀 설정이 아직 완료되지 않았습니다'
      }
      res.json({
        gaId,
        featureEnabled: settings.featureEnabled,
        configReady: settings.configReady,
        showDesignerUi,
        message,
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  /** 설계사: 운영 엑셀 업로드 (GA 단위, 기존 업로드 행 교체) */
  /** 레거시 GA 공용 업로드 — 종료. 유저는 「내 정보 관리」에서 업로드 */
  apiRouter.post('/ga-customer-excel/upload', requireAuth, uploadExcel.single('file'), async (_req, res) => {
    res.status(410).json({
      message: 'GA 공용 엑셀 업로드는 종료되었습니다. 좌측 메뉴 「내 정보 관리」에서 고객 데이터 엑셀을 업로드해 주십시오.',
    })
  })

  /** 설계사: 고객 기준 유저 엑셀 (user_excel_data + GA 매칭 + 표시 설정) */
  apiRouter.get('/customers/:id/ga-excel-data', requireAuth, async (req, res) => {
    try {
      const userId = requireInsuranceFormUserId(req, res)
      if (!userId) {
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const customerId = Number(req.params.id)
      if (!Number.isInteger(customerId) || customerId < 1) {
        res.status(400).json({ message: '잘못된 고객 ID입니다.' })
        return
      }

      const payload = await buildUserGaExcelCustomerPayload(pool, { userId, gaId, customerId })
      if (payload.status === 403) {
        res.status(403).json({ message: payload.body.message })
        return
      }
      if (payload.status === 404) {
        res.status(404).json({ message: payload.body.message })
        return
      }
      res.status(200).json(payload.body)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.post('/user/excel-data', requireAuth, uploadExcel.single('file'), async (req, res) => {
    const client = await pool.connect()
    try {
      const userId = requireInsuranceFormUserId(req, res)
      if (!userId) {
        return
      }
      if (blockNonDesignerExcelUser(req, res)) {
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const settings = await loadSettingsOrDefault(pool, gaId)
      if (!settings.featureEnabled || !settings.configReady) {
        res.status(403).json({ message: 'GA 엑셀 설정이 필요합니다' })
        return
      }
      const file = req.file
      if (!file?.buffer) {
        res.status(400).json({ message: '엑셀 파일을 선택해 주세요.' })
        return
      }
      let dataRows
      let parsedColumns
      try {
        const parsed = parseExcelSampleToColumnsAndRows(file.buffer)
        parsedColumns = parsed.columns
        dataRows = parsed.dataRows
      } catch (err) {
        const code = err instanceof Error ? err.message : 'PARSE_ERROR'
        res.status(400).json({ message: '엑셀을 읽을 수 없습니다.', code })
        return
      }

      const expectedIds = columnIdSet(settings.sampleColumns)
      const actualIds = new Set(parsedColumns.map((c) => c.id))
      if (expectedIds.size !== actualIds.size) {
        res.status(400).json({ message: '업로드 파일의 열 구조가 GA에 설정된 샘플 엑셀과 다릅니다.' })
        return
      }
      for (const id of expectedIds) {
        if (!actualIds.has(id)) {
          res.status(400).json({ message: '업로드 파일의 열 구조가 GA에 설정된 샘플 엑셀과 다릅니다.' })
          return
        }
      }

      await client.query('BEGIN')
      await safeQuery(client, `DELETE FROM user_excel_data WHERE user_id = $1 AND ga_id = $2`, [userId, gaId])

      for (const dr of dataRows) {
        await safeQuery(
          client,
          `
          INSERT INTO user_excel_data (user_id, ga_id, row_index, row_data)
          VALUES ($1, $2, $3, CAST($4 AS jsonb)::jsonb)
          `,
          [userId, gaId, dr.rowIndex, JSON.stringify(dr.cells)],
        )
      }

      await client.query('COMMIT')
      res.json({ ok: true, rowCount: dataRows.length })
    } catch (e) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* ignore */
      }
      handleDbError(e, req, res)
    } finally {
      client.release()
    }
  })

  apiRouter.get('/user/excel-data', requireAuth, async (req, res) => {
    try {
      const userId = requireInsuranceFormUserId(req, res)
      if (!userId) {
        return
      }
      if (blockNonDesignerExcelUser(req, res)) {
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const settings = await loadSettingsOrDefault(pool, gaId)
      const rowsRes = await safeQuery(
        pool,
        `
        SELECT row_index, row_data
        FROM user_excel_data
        WHERE user_id = $1 AND ga_id = $2
        ORDER BY row_index ASC, id ASC
        `,
        [userId, gaId],
      )
      const rows = rowsRes.rows.map((r) => ({
        rowIndex: Number(r.row_index),
        cells: typeof r.row_data === 'object' && r.row_data != null ? r.row_data : {},
      }))
      const visRes = await safeQuery(
        pool,
        `
        SELECT column_name, is_visible
        FROM user_excel_column_settings
        WHERE user_id = $1 AND ga_id = $2
        `,
        [userId, gaId],
      )
      const columnSettings = visRes.rows.map((r) => ({
        column_name: String(r.column_name),
        is_visible: Boolean(r.is_visible),
      }))
      res.json({
        sampleColumns: settings.sampleColumns,
        sourceRowCount: rows.length,
        rows,
        columnSettings,
      })
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.get('/user/excel-data/customer/:customerId', requireAuth, async (req, res) => {
    try {
      const userId = requireInsuranceFormUserId(req, res)
      if (!userId) {
        return
      }
      if (blockNonDesignerExcelUser(req, res)) {
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const customerId = Number(req.params.customerId)
      if (!Number.isInteger(customerId) || customerId < 1) {
        res.status(400).json({ message: '잘못된 고객 ID입니다.' })
        return
      }
      const payload = await buildUserGaExcelCustomerPayload(pool, { userId, gaId, customerId })
      if (payload.status === 403) {
        res.status(403).json({ message: payload.body.message })
        return
      }
      if (payload.status === 404) {
        res.status(404).json({ message: payload.body.message })
        return
      }
      res.status(200).json(payload.body)
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

  apiRouter.patch('/user/excel-columns', requireAuth, async (req, res) => {
    try {
      const userId = requireInsuranceFormUserId(req, res)
      if (!userId) {
        return
      }
      if (blockNonDesignerExcelUser(req, res)) {
        return
      }
      const gaId = parseGaId(req.user?.gaId)
      if (gaId == null) {
        res.status(400).json({ message: 'GA 컨텍스트가 없습니다.' })
        return
      }
      const settings = await loadSettingsOrDefault(pool, gaId)
      if (!settings.featureEnabled || !settings.configReady) {
        res.status(403).json({ message: 'GA 엑셀 설정이 필요합니다' })
        return
      }
      const body = req.body
      if (!Array.isArray(body)) {
        res.status(400).json({ message: '요청 본문은 배열이어야 합니다.' })
        return
      }

      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        for (const item of body) {
          const rawName = item?.column_name ?? item?.columnName
          const isVisible = Boolean(item?.is_visible ?? item?.isVisible ?? true)
          const colId = resolveSampleColumnId(settings.sampleColumns, rawName)
          if (!colId) {
            await client.query('ROLLBACK')
            res.status(400).json({
              message: `알 수 없는 컬럼입니다: ${String(rawName ?? '')}`,
            })
            return
          }
          await safeQuery(
            client,
            `
            INSERT INTO user_excel_column_settings (user_id, ga_id, column_name, is_visible, updated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (user_id, ga_id, column_name)
            DO UPDATE SET is_visible = EXCLUDED.is_visible, updated_at = NOW()
            `,
            [userId, gaId, colId, isVisible],
          )
        }
        await client.query('COMMIT')
        res.json({ ok: true })
      } catch (e) {
        try {
          await client.query('ROLLBACK')
        } catch {
          /* ignore */
        }
        throw e
      } finally {
        client.release()
      }
    } catch (e) {
      handleDbError(e, req, res)
    }
  })

}
