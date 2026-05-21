import type { GaCustomerExcelDataRow } from '../api/gaCustomerExcelApi'

/** GA 고객 엑셀 조회 API 페이로드(일부 필드) */
export type GaCustomerExcelApiPayload = {
  displayHeaders: string[]
  displayColumnIds: string[]
  rows: GaCustomerExcelDataRow[]
  displayColumnFallback?: boolean
}

export type NormalizedGaCustomerExcelDisplay = {
  displayHeaders: string[]
  displayColumnIds: string[]
  rows: GaCustomerExcelDataRow[]
  clientAppliedFallback: boolean
}

export const MSG_GA_EXCEL_NO_MAPPED_DATA =
  'GA 업로드 데이터가 없거나 현재 고객과 매칭된 데이터가 없습니다.'
export const MSG_GA_EXCEL_UPLOAD_HINT = '업로드는 내정보관리 페이지에서 진행합니다.'
export const MSG_GA_EXCEL_COLUMN_FALLBACK = '표시 열 설정이 없어 기본 항목으로 표시합니다.'
export const MSG_GA_EXCEL_FETCH_FAILED = 'GA 데이터를 불러오지 못했습니다.'
export const MSG_GA_EXCEL_NO_DISPLAY_KEYS = '데이터는 있으나 표시할 항목을 찾지 못했습니다.'

const COLUMN_ID_LABEL_HINTS: Array<{ test: (id: string) => boolean; label: string }> = [
  { test: (id) => /name|이름|고객명|customer/i.test(id), label: '이름' },
  { test: (id) => /phone|mobile|tel|연락|휴대|전화/i.test(id), label: '연락처' },
  { test: (id) => /birth|생년/i.test(id), label: '생년월일' },
  { test: (id) => /company|보험사|insurer/i.test(id), label: '보험회사' },
  { test: (id) => /product|상품/i.test(id), label: '상품명' },
  { test: (id) => /premium|보험료/i.test(id), label: '보험료' },
  { test: (id) => /contract|계약일/i.test(id), label: '계약일' },
  { test: (id) => /status|상태/i.test(id), label: '상태' },
]

export function formatGaCellDisplay(value: string | undefined | null): string {
  const s = String(value ?? '').trim()
  return s === '' ? '-' : s
}

function headerLabelForColumnId(id: string): string {
  const hit = COLUMN_ID_LABEL_HINTS.find((h) => h.test(id))
  return hit ? hit.label : id
}

function sortFallbackColumnIds(ids: string[]): string[] {
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
  const score = (id: string) => {
    const s = id.toLowerCase()
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
    const d = score(a) - score(b)
    if (d !== 0) return d
    return a.localeCompare(b, 'ko')
  })
}

/**
 * 서버가 내려준 표시 열이 비었을 때, 행 cells 키로 클라이언트 보강(구 API·중간 캐시 대비).
 * 서버에서 displayColumnFallback 처리 후에는 대개 clientAppliedFallback=false.
 */
export function normalizeGaCustomerExcelDisplay(data: GaCustomerExcelApiPayload): NormalizedGaCustomerExcelDisplay {
  const rowList = Array.isArray(data.rows) ? data.rows : []
  const displayHeaders = [...(data.displayHeaders ?? [])].map((h) => String(h))
  const displayColumnIds = [...(data.displayColumnIds ?? [])].map((c) => String(c))

  if (displayColumnIds.length > 0) {
    return { displayHeaders, displayColumnIds, rows: rowList, clientAppliedFallback: false }
  }

  if (rowList.length === 0) {
    return { displayHeaders: [], displayColumnIds: [], rows: [], clientAppliedFallback: false }
  }

  const keySet = new Set<string>()
  for (const r of rowList) {
    const cells = r.cells ?? {}
    for (const k of Object.keys(cells)) {
      keySet.add(String(k))
    }
  }

  if (keySet.size === 0) {
    return { displayHeaders: [], displayColumnIds: [], rows: rowList, clientAppliedFallback: false }
  }

  const nextIds = sortFallbackColumnIds([...keySet])
  const nextHeaders = nextIds.map((id) => headerLabelForColumnId(id))
  const expandedRows = rowList.map((r) => {
    const cells: Record<string, string> = { ...(r.cells ?? {}) }
    for (const id of nextIds) {
      if (!(id in cells)) {
        cells[id] = ''
      }
    }
    return { rowIndex: r.rowIndex, cells }
  })

  return {
    displayHeaders: nextHeaders,
    displayColumnIds: nextIds,
    rows: expandedRows,
    clientAppliedFallback: true,
  }
}
