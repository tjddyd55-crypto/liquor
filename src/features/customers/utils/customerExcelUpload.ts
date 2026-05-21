import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'

import type { CustomerNote } from '../domain/types'
import { normalizeCustomerNotesBag } from '../domain/types'
import type { SaveCustomerPayload } from '../api/customersApi'
import { saveCustomer } from '../api/customersApi'

/**
 * 샘플·업로드 공통 헤더 순서 (1행)
 * `CustomerForm` 입력 순서와 맞춤: 이름 → 성별 → 주민번호 → 연락·신체 → 직업 → 운전·차종 → 자동차 정보 → 건강 · 보험가입내역 → 메모
 */
export const CUSTOMER_EXCEL_UPLOAD_HEADERS = [
  'name',
  'gender',
  'ssn',
  'phone',
  'address',
  'height',
  'weight',
  'job',
  'isDriver',
  'carType',
  'carNumber',
  'carModel',
  'carYear',
  'renewalDate',
  'medical',
  'insuranceHistory',
  'memo',
] as const

const CUSTOMER_EXCEL_UPLOAD_HEADER_LABELS_KO = [
  '이름',
  '성별',
  '주민번호',
  '휴대폰번호',
  '주소',
  '키',
  '몸무게',
  '직업',
  '운전여부',
  '자동차종류',
  '차번호',
  '자동차모델명',
  '년식',
  '갱신일',
  '병력사항',
  '보험가입내역',
  '메모',
] as const

const SHEET_DATA = '고객데이터'
const SHEET_DESC = '컬럼설명'
const SAMPLE_FILENAME = 'customer-upload-sample.xlsx'

const HEADER_LABEL_TO_KEY: Record<string, (typeof CUSTOMER_EXCEL_UPLOAD_HEADERS)[number]> = {
  이름: 'name',
  성별: 'gender',
  주민번호: 'ssn',
  휴대폰번호: 'phone',
  주소: 'address',
  키: 'height',
  몸무게: 'weight',
  직업: 'job',
  운전여부: 'isDriver',
  자동차종류: 'carType',
  차번호: 'carNumber',
  자동차모델명: 'carModel',
  년식: 'carYear',
  갱신일: 'renewalDate',
  병력사항: 'medical',
  보험가입내역: 'insuranceHistory',
  메모: 'memo',
}

/** 한국 주민등록번호 본문 13자리 (검증·병합 키용) */
export const RRN_NORMALIZED_LENGTH = 13

/**
 * 엑셀 일괄 업로드 1회 요청 상한(서버·브라우저 부하 완화).
 * DB에 이미 있는 주민번호 중복 차단은 서버(API) 쪽 검증이 필요하다(다음 단계).
 */
export const CUSTOMER_EXCEL_UPLOAD_MAX_BATCH = 300

/** 숫자만 추출. 비정상·누락 시 병합 키로 쓰지 않도록 길이 검증은 호출부에서 한다. */
export function normalizeSsn(ssn: string): string {
  return String(ssn ?? '')
    .replace(/\D/g, '')
    .trim()
}

export type CustomerExcelParsedRow = {
  name: string
  ssn: string
  genderRaw: string
  phone: string
  address: string
  height: string
  weight: string
  job: string
  isDriver: boolean | null
  carType: string
  medical: string
  carNumber: string
  carModel: string
  carYear: string
  renewalDate: string
  /** 보험가입내역 — notes.insuranceHistory */
  insuranceHistory: string
  memoRaw: string
}

export type CustomerUploadFailure = {
  name: string
  ssn: string
  message: string
}

export type CustomerUploadBatchResult = {
  total: number
  success: number
  failed: number
  failures: CustomerUploadFailure[]
  /** API 오류 난 요청 본문 — 재업로드·JSON/엑셀 저장용 */
  failedPayloads: SaveCustomerPayload[]
}

/** 주민번호 형식 오류 등 업로드에서 제외된 행 */
export type PreparedExcludedRow = {
  /** 엑셀 시트 행 번호(1부터, 헤더=1). 병합 후 제외 등 알 수 없으면 0 */
  excelRow: number
  category: 'invalid_ssn' | 'missing_name' | 'other'
  reason: string
  values: Record<string, string>
}

export type CustomerExcelPrepareResult = {
  payloads: SaveCustomerPayload[]
  excludedRows: PreparedExcludedRow[]
  stats: {
    /** 시트에서 읽은 데이터 행 수(헤더 제외) */
    totalSheetRows: number
    /** 주민번호 13자리 미달/초과/공란 등 */
    skippedInvalidSsnCount: number
    /** 병합 후 이름 없음 등 */
    skippedOtherCount: number
    /** 같은 주민번호로 묶인 "추가 행" 수 (합쳐진 횟수) */
    mergedAbsorbedRowCount: number
    /** 주민번호가 2행 이상 등장한 고유 번호 개수 */
    duplicateSsnGroupCount: number
    /** API 전송 예정 건수 */
    uploadReadyCount: number
  }
}

function cellToString(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE'
  }
  return String(value)
}

function newNoteId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** 메모: "/" 분리 → notes (서버 검증용 id 포함) */
export function memoToNotes(memoRaw: string, createdAt: string): CustomerNote[] {
  const raw = cellToString(memoRaw).trim()
  if (!raw) {
    return []
  }
  const rawParts = raw
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const parts: string[] = []
  for (const p of rawParts) {
    if (seen.has(p)) {
      continue
    }
    seen.add(p)
    parts.push(p)
  }
  return parts.map((content) => ({
    id: newNoteId(),
    content,
    createdAt,
  }))
}

export function parseGender(value: unknown): '' | 'male' | 'female' {
  const s = cellToString(value).trim().toLowerCase()
  if (s === 'male' || s === 'female') {
    return s
  }
  return ''
}

/** 스펙: "TRUE" / "FALSE" 만 인정, 그 외 null. 엑셀 불리언·대소문자 허용. */
export function parseIsDriverCell(value: unknown): boolean | null {
  if (value === true) {
    return true
  }
  if (value === false) {
    return false
  }
  const s = cellToString(value).trim().toUpperCase()
  if (s === 'TRUE') {
    return true
  }
  if (s === 'FALSE') {
    return false
  }
  return null
}

function drivingFromIsDriver(isDriver: boolean | null): string {
  if (isDriver === true) {
    return '운전함'
  }
  if (isDriver === false) {
    return '운전 안함'
  }
  return ''
}

/** 뒤 행(b)에 유효한 값이 있으면 우선 (엑셀 하단이 최신인 경우가 많음) */
function pickValue(a: string, b: string): string {
  const tb = String(b ?? '').trim()
  if (tb !== '') {
    return tb
  }
  return String(a ?? '').trim()
}

function memoPartsFromRaw(raw: string): string[] {
  return cellToString(raw)
    .split('/')
    .map((p) => p.trim())
    .filter(Boolean)
}

/** "/"로 쪼갠 조각을 순서 유지한 채 중복만 제거한 뒤 다시 join (memoToNotes와 호환) */
function mergeMemoPartsUnique(a: string, b: string): string {
  const combined = [...memoPartsFromRaw(a), ...memoPartsFromRaw(b)]
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const p of combined) {
    if (seen.has(p)) {
      continue
    }
    seen.add(p)
    ordered.push(p)
  }
  return ordered.join(' / ')
}

function mergeIsDriver(a: boolean | null, b: boolean | null): boolean | null {
  if (a !== null && b !== null) {
    return b
  }
  return a !== null ? a : b
}

function parsedRowToExportRecord(row: CustomerExcelParsedRow): Record<string, string> {
  const d =
    row.isDriver === true ? 'TRUE' : row.isDriver === false ? 'FALSE' : ''
  return {
    name: row.name,
    ssn: row.ssn,
    gender: cellToString(row.genderRaw),
    phone: row.phone,
    address: row.address,
    height: row.height,
    weight: row.weight,
    job: row.job,
    isDriver: d,
    carType: row.carType,
    medical: row.medical,
    carNumber: row.carNumber,
    carModel: row.carModel,
    carYear: row.carYear,
    renewalDate: row.renewalDate,
    insuranceHistory: row.insuranceHistory,
    memo: row.memoRaw,
  }
}

function payloadToExportRecord(p: SaveCustomerPayload): Record<string, string> {
  const g = p.gender === null || p.gender === undefined ? '' : String(p.gender)
  const d =
    p.isDriver === true ? 'TRUE' : p.isDriver === false ? 'FALSE' : ''
  const bag = normalizeCustomerNotesBag(p.notes)
  return {
    name: p.name ?? '',
    ssn: String(p.ssn ?? ''),
    gender: g,
    phone: p.phone ?? '',
    address: p.address ?? '',
    height: p.height ?? '',
    weight: p.weight ?? '',
    job: p.job ?? '',
    isDriver: d,
    carType: p.carType ?? '',
    medical: p.medical ?? '',
    carNumber: p.carNumber ?? '',
    carModel: p.carModel ?? '',
    carYear: p.carYear ?? '',
    renewalDate: p.renewalDate ?? '',
    insuranceHistory: bag.insuranceHistory,
    memo: bag.items.map((n) => n.content).join(' / '),
  }
}

/** 주민번호 정규화·13자리 검증을 통과한 행만 넣어 통계 */
function duplicateMergeMetrics(validRows: CustomerExcelParsedRow[]): {
  duplicateSsnGroupCount: number
  mergedAbsorbedRowCount: number
} {
  const byKey = new Map<string, number>()
  for (const r of validRows) {
    const k = normalizeSsn(r.ssn)
    if (k.length !== RRN_NORMALIZED_LENGTH) {
      continue
    }
    byKey.set(k, (byKey.get(k) ?? 0) + 1)
  }
  let duplicateSsnGroupCount = 0
  let mergedAbsorbedRowCount = 0
  for (const c of byKey.values()) {
    if (c > 1) {
      duplicateSsnGroupCount += 1
      mergedAbsorbedRowCount += c - 1
    }
  }
  return { duplicateSsnGroupCount, mergedAbsorbedRowCount }
}

export function parseExcel(file: File): Promise<CustomerExcelParsedRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'))
    reader.onload = () => {
      try {
        const buf = reader.result
        if (!(buf instanceof ArrayBuffer)) {
          reject(new Error('파일 형식이 올바르지 않습니다.'))
          return
        }
        const wb = XLSX.read(buf, { type: 'array' })
        const sheet = wb.Sheets[SHEET_DATA]
        if (!sheet) {
          reject(new Error(`「${SHEET_DATA}」시트를 찾을 수 없습니다.`))
          return
        }
        const rows2d = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
          header: 1,
          defval: '',
          raw: false,
        })
        if (rows2d.length === 0) {
          resolve([])
          return
        }

        const normalizeHeader = (value: unknown): string =>
          cellToString(value).trim().replace(/\s+/g, '').toLowerCase()

        const resolveHeaderKeys = (row: unknown[] | undefined): string[] => {
          if (!Array.isArray(row)) {
            return []
          }
          return row.map((cell) => {
            const raw = cellToString(cell).trim()
            if (!raw) {
              return ''
            }
            const normalized = normalizeHeader(raw)
            const keyMatch = CUSTOMER_EXCEL_UPLOAD_HEADERS.find(
              (k) => normalizeHeader(k) === normalized,
            )
            if (keyMatch) {
              return keyMatch
            }
            const byLabel = HEADER_LABEL_TO_KEY[raw]
            if (byLabel) {
              return byLabel
            }
            return ''
          })
        }

        const hasRequiredKeys = (keys: string[]): boolean => {
          const set = new Set(keys.filter(Boolean))
          return set.has('name') && set.has('ssn')
        }

        const firstHeaderKeys = resolveHeaderKeys(rows2d[0] as unknown[])
        const secondHeaderKeys = resolveHeaderKeys(rows2d[1] as unknown[] | undefined)
        const useSecondHeader = !hasRequiredKeys(firstHeaderKeys) && hasRequiredKeys(secondHeaderKeys)
        const headerKeys = useSecondHeader ? secondHeaderKeys : firstHeaderKeys
        const dataStartIndex = useSecondHeader ? 2 : 1

        const rows = rows2d.slice(dataStartIndex).map((line) => {
          const rec: Record<string, unknown> = {}
          headerKeys.forEach((key, idx) => {
            if (!key) {
              return
            }
            rec[key] = Array.isArray(line) ? line[idx] : ''
          })
          return rec
        })

        const parsed: CustomerExcelParsedRow[] = []
        for (const row of rows) {
          parsed.push({
            name: cellToString(row.name).trim(),
            ssn: cellToString(row.ssn).trim(),
            genderRaw: cellToString(row.gender),
            phone: cellToString(row.phone),
            address: cellToString(row.address),
            height: cellToString(row.height),
            weight: cellToString(row.weight),
            job: cellToString(row.job),
            isDriver: parseIsDriverCell(row.isDriver),
            carType: cellToString(row.carType),
            medical: cellToString(row.medical),
            carNumber: cellToString(row.carNumber),
            carModel: cellToString(row.carModel),
            carYear: cellToString(row.carYear),
            renewalDate: cellToString(row.renewalDate),
            insuranceHistory: cellToString(row.insuranceHistory),
            memoRaw: cellToString(row.memo),
          })
        }
        resolve(parsed)
      } catch (e) {
        reject(e instanceof Error ? e : new Error('엑셀 파싱에 실패했습니다.'))
      }
    }
    reader.readAsArrayBuffer(file)
  })
}

export function mergeRowsBySsn(rows: CustomerExcelParsedRow[]): CustomerExcelParsedRow[] {
  const map = new Map<string, CustomerExcelParsedRow>()
  for (const row of rows) {
    const normalized = normalizeSsn(row.ssn)
    if (normalized.length !== RRN_NORMALIZED_LENGTH) {
      continue
    }
    const rowNorm: CustomerExcelParsedRow = { ...row, ssn: normalized }
    const prev = map.get(normalized)
    if (!prev) {
      map.set(normalized, rowNorm)
      continue
    }
    const merged: CustomerExcelParsedRow = {
      name: pickValue(prev.name, rowNorm.name),
      ssn: normalized,
      genderRaw: pickValue(prev.genderRaw, rowNorm.genderRaw),
      phone: pickValue(prev.phone, rowNorm.phone),
      address: pickValue(prev.address, rowNorm.address),
      height: pickValue(prev.height, rowNorm.height),
      weight: pickValue(prev.weight, rowNorm.weight),
      job: pickValue(prev.job, rowNorm.job),
      isDriver: mergeIsDriver(prev.isDriver, rowNorm.isDriver),
      carType: pickValue(prev.carType, rowNorm.carType),
      medical: pickValue(prev.medical, rowNorm.medical),
      carNumber: pickValue(prev.carNumber, rowNorm.carNumber),
      carModel: pickValue(prev.carModel, rowNorm.carModel),
      carYear: pickValue(prev.carYear, rowNorm.carYear),
      renewalDate: pickValue(prev.renewalDate, rowNorm.renewalDate),
      insuranceHistory: pickValue(prev.insuranceHistory, rowNorm.insuranceHistory),
      memoRaw: mergeMemoPartsUnique(prev.memoRaw, rowNorm.memoRaw),
    }
    map.set(normalized, merged)
  }
  return [...map.values()]
}

/** 필수(name, 주민번호 숫자 13자리) 미충족 시 null */
export function transformRow(row: CustomerExcelParsedRow): SaveCustomerPayload | null {
  const name = row.name.trim()
  const ssnNorm = normalizeSsn(row.ssn)
  if (!name || ssnNorm.length !== RRN_NORMALIZED_LENGTH) {
    return null
  }
  const ssn = ssnNorm
  const gender = parseGender(row.genderRaw)
  const isDriver = row.isDriver
  const createdAt = new Date().toISOString()
  const noteItems = memoToNotes(row.memoRaw, createdAt)
  const carTypeTrim = row.carType.trim()
  const insuranceHistory = row.insuranceHistory.trim()
  return {
    name,
    ssn,
    gender: gender === '' ? '' : gender,
    phone: row.phone.trim(),
    carrier: '',
    address: row.address.trim(),
    height: row.height.trim(),
    weight: row.weight.trim(),
    job: row.job.trim(),
    isDriver,
    carType: isDriver === true ? carTypeTrim : '',
    medical: row.medical.trim(),
    carNumber: row.carNumber.trim(),
    carModel: row.carModel.trim(),
    carYear: row.carYear.trim(),
    renewalDate: row.renewalDate.trim(),
    driving: drivingFromIsDriver(isDriver),
    notes: {
      items: noteItems,
      insuranceHistory,
    },
  }
}

/**
 * 파싱 → 주민번호 검증·제외 집계 → 중복 병합 → 업로드용 페이로드.
 * UI 미리보기·제외/실패 다운로드에 사용한다.
 */
export async function prepareCustomerExcelImport(file: File): Promise<CustomerExcelPrepareResult> {
  const parsed = await parseExcel(file)
  const totalSheetRows = parsed.length
  const excludedRows: PreparedExcludedRow[] = []
  const valid: CustomerExcelParsedRow[] = []

  parsed.forEach((row, idx) => {
    const excelRow = idx + 2
    const norm = normalizeSsn(row.ssn)
    if (norm.length !== RRN_NORMALIZED_LENGTH) {
      const reason =
        norm.length === 0
          ? '주민번호 없음 (13자리 숫자 필요)'
          : `주민번호 ${norm.length}자리 (13자리 필요)`
      excludedRows.push({
        excelRow,
        category: 'invalid_ssn',
        reason,
        values: parsedRowToExportRecord(row),
      })
      return
    }
    valid.push({ ...row, ssn: norm })
  })

  const { duplicateSsnGroupCount, mergedAbsorbedRowCount } = duplicateMergeMetrics(valid)
  const merged = mergeRowsBySsn(valid)
  const payloads: SaveCustomerPayload[] = []

  for (const m of merged) {
    if (!m.name.trim()) {
      excludedRows.push({
        excelRow: 0,
        category: 'missing_name',
        reason: '이름 없음',
        values: parsedRowToExportRecord(m),
      })
      continue
    }
    const p = transformRow(m)
    if (p) {
      payloads.push(p)
    } else {
      excludedRows.push({
        excelRow: 0,
        category: 'other',
        reason: '필수값 검증 실패',
        values: parsedRowToExportRecord(m),
      })
    }
  }

  const skippedInvalidSsnCount = excludedRows.filter((r) => r.category === 'invalid_ssn').length
  const skippedOtherCount = excludedRows.length - skippedInvalidSsnCount

  return {
    payloads,
    excludedRows,
    stats: {
      totalSheetRows,
      skippedInvalidSsnCount,
      skippedOtherCount,
      mergedAbsorbedRowCount,
      duplicateSsnGroupCount,
      uploadReadyCount: payloads.length,
    },
  }
}

export function downloadCustomerUploadSampleXlsx(): void {
  const headersKo = [...CUSTOMER_EXCEL_UPLOAD_HEADER_LABELS_KO]
  const headers = [...CUSTOMER_EXCEL_UPLOAD_HEADERS]
  /** 폼(고객 등록) 필드 순서와 동일: 이름·성별·주민번호·…·자동차 정보·건강고지·보험가입내역·메모 */
  const row1 = [
    '홍길동',
    'male',
    '8001011234567',
    '01012341234',
    '서울 광진구 자양동 12-3',
    '175',
    '70',
    '자영업(카페)',
    'TRUE',
    '승용차',
    '12가3456',
    '그랜저',
    '2022',
    '2026-06-15',
    '5년 이내 입원·수술 없음',
    '실손의료비 2018년 가입(갱신형) / 자동차종합보험 다이렉트',
    '지인 소개 / VIP 우대',
  ]
  const row2 = [
    '김영희',
    'female',
    '9002022234567',
    '01056785678',
    '서울 강남구 역삼로 10길 5',
    '160',
    '52',
    '회사원',
    'FALSE',
    '',
    '',
    '',
    '',
    '',
    '특이사항 없음',
    '암·뇌졸중 진단비 3천만원 (2021) / 변액유니버셜 5년납',
    '보험 상담 예약',
  ]
  const descHeader = ['컬럼명', '설명']
  const descRows: [string, string][] = [
    ['name', '필수. 고객 이름 (폼「이름」)'],
    ['gender', 'male 또는 female (폼「성별」과 동일)'],
    ['ssn', `필수. 주민등록번호 숫자 ${RRN_NORMALIZED_LENGTH}자리(하이픈 없음). 길이 오류 행은 업로드 제외`],
    ['phone', '전화번호 (폼「전화번호」)'],
    ['address', '주소'],
    ['height', '키(cm 등 자유)'],
    ['weight', '몸무게(kg 등 자유)'],
    ['job', '직업 / 회사명 / 하는 일 / 지역'],
    ['isDriver', 'TRUE(운전함) / FALSE(운전 안함). 빈 칸은 미입력'],
    ['carType', '운전함일 때 차종(예: 승용차, SUV). 운전 안함이면 비워도 됨'],
    ['carNumber', '차량번호'],
    ['carModel', '차종(차명) 예: 그랜저'],
    ['carYear', '연식(예: 2022)'],
    ['renewalDate', '만기(갱신)일 — YYYY-MM-DD 권장(폼 date와 동일)'],
    ['medical', '병력사항'],
    ['insuranceHistory', '보험가입내역(긴 텍스트). 폼의「보험가입내역」과 동일하게 저장'],
    ['memo', '메모(폼「메모」). "/" 로 구분 시 여러 메모 항목으로 나뉨, 중복 문구는 제거'],
  ]
  const sheet1 = XLSX.utils.aoa_to_sheet([headersKo, headers, row1, row2])
  const sheet2 = XLSX.utils.aoa_to_sheet([descHeader, ...descRows])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet1, SHEET_DATA)
  XLSX.utils.book_append_sheet(wb, sheet2, SHEET_DESC)
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    SAMPLE_FILENAME,
  )
}

/**
 * 변환·중복 제거 후 순차 POST. onProgress: (done, total) — done은 시도 완료 건수.
 */
export async function uploadCustomers(
  token: string,
  payloads: SaveCustomerPayload[],
  onProgress?: (done: number, total: number) => void,
): Promise<CustomerUploadBatchResult> {
  const failures: CustomerUploadFailure[] = []
  const failedPayloads: SaveCustomerPayload[] = []
  let success = 0
  const total = payloads.length
  let done = 0

  for (const payload of payloads) {
    try {
      await saveCustomer(token, payload)
      success += 1
    } catch (e: unknown) {
      // 한 건 실패해도 루프는 계속 진행한다.
      const message = e instanceof Error ? e.message : '저장에 실패했습니다.'
      failures.push({
        name: payload.name,
        ssn: String(payload.ssn ?? ''),
        message,
      })
      failedPayloads.push(payload)
    } finally {
      done += 1
      onProgress?.(done, total)
    }
  }

  return {
    total,
    success,
    failed: failures.length,
    failures,
    failedPayloads,
  }
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 주민번호 오류·이름 누락 등 제외 행 엑셀 저장 */
export function downloadExcludedRowsExcel(
  rows: PreparedExcludedRow[],
  baseFilename = 'customer-upload-excluded',
): void {
  if (rows.length === 0) {
    return
  }
  const headers = ['excelRow', 'category', 'reason', ...CUSTOMER_EXCEL_UPLOAD_HEADERS]
  const dataRows = rows.map((r) => [
    r.excelRow,
    r.category,
    r.reason,
    ...CUSTOMER_EXCEL_UPLOAD_HEADERS.map((h) => r.values[h] ?? ''),
  ])
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  sheet['!cols'] = headers.map(() => ({ wch: 16 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '제외데이터')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${baseFilename}_${todayYmd()}.xlsx`,
  )
}

/** API 저장 실패 건 — 업로드 템플릿 형식 + 오류 메시지 */
export function downloadFailedApiRowsExcel(
  failedPayloads: SaveCustomerPayload[],
  failures: CustomerUploadFailure[],
  baseFilename = 'customer-upload-api-failed',
): void {
  if (failedPayloads.length === 0) {
    return
  }
  const headers = [...CUSTOMER_EXCEL_UPLOAD_HEADERS, 'errorMessage']
  const dataRows = failedPayloads.map((p, i) => {
    const rec = payloadToExportRecord(p)
    const row = CUSTOMER_EXCEL_UPLOAD_HEADERS.map((h) => rec[h] ?? '')
    const msg = failures[i]?.message ?? ''
    return [...row, msg]
  })
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
  sheet['!cols'] = headers.map(() => ({ wch: 18 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '실패데이터')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${baseFilename}_${todayYmd()}.xlsx`,
  )
}

export function downloadFailedPayloadsJson(
  failedPayloads: SaveCustomerPayload[],
  baseFilename = 'customer-upload-api-failed',
): void {
  if (failedPayloads.length === 0) {
    return
  }
  const text = JSON.stringify(failedPayloads, null, 2)
  saveAs(
    new Blob([text], { type: 'application/json;charset=utf-8' }),
    `${baseFilename}_${todayYmd()}.json`,
  )
}

/** 파싱 → 주민번호 병합 → 페이로드 (스킵 행 제외) — prepare 결과의 payloads만 반환 */
export async function parseExcelToPayloads(file: File): Promise<SaveCustomerPayload[]> {
  const prep = await prepareCustomerExcelImport(file)
  return prep.payloads
}
