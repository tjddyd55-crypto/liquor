import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import {
  fetchCustomerGaExcelData,
  type GaCustomerExcelDataRow,
} from '../api/gaCustomerExcelApi'
import {
  MSG_GA_EXCEL_COLUMN_FALLBACK,
  MSG_GA_EXCEL_FETCH_FAILED,
  normalizeGaCustomerExcelDisplay,
} from '../utils/gaCustomerDataView'

/**
 * [데이터·상태 훅] GA 고객 데이터 페이지.
 *
 * 책임:
 *  - 선택된 customer 의 GA 엑셀 매핑 결과를 API 로 로드한다.
 *  - 테이블 정렬(열 클릭·토글) 상태를 관리한다.
 *
 * 책임이 아닌 것:
 *  - UI 마크업. (PC/Mobile View 에서 담당)
 *  - 라우팅·권한 가드. (CustomerGaExcelPage container 에서 담당)
 *
 * 이 훅을 호출하는 View 는 단일 렌더 컴포넌트여야 한다.
 * ResponsiveLayout 이 PC/Mobile View 중 하나만 렌더하므로 중복 호출은 발생하지 않는다.
 */
export type UseGaCustomerExcelDataResult = {
  loading: boolean
  error: string
  info: string
  headers: string[]
  colIds: string[]
  sortedRows: GaCustomerExcelDataRow[]
  sortIdx: number | null
  sortAsc: boolean
  onHeaderClick: (idx: number) => void
  clearColumnSort: () => void
  reload: () => Promise<void>
}

export function useGaCustomerExcelData(customerId: number): UseGaCustomerExcelDataResult {
  const { token } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [colIds, setColIds] = useState<string[]>([])
  const [rows, setRows] = useState<GaCustomerExcelDataRow[]>([])
  const [sortIdx, setSortIdx] = useState<number | null>(null)
  const [sortAsc, setSortAsc] = useState(true)

  // 고객이 바뀌면 직전 고객의 데이터·정렬이 한 프레임 노출되는 것을 막기 위한 선제 초기화.
  useEffect(() => {
    if (!token?.trim() || !Number.isFinite(customerId) || customerId < 1) {
      return
    }
    setHeaders([])
    setColIds([])
    setRows([])
    setSortIdx(null)
    setSortAsc(true)
  }, [customerId, token])

  const load = useCallback(async () => {
    if (!token?.trim() || !Number.isFinite(customerId) || customerId < 1) {
      setLoading(false)
      return
    }
    setError('')
    setInfo('')
    setLoading(true)
    try {
      const data = await fetchCustomerGaExcelData(token, customerId)
      const normalized = normalizeGaCustomerExcelDisplay({
        displayHeaders: data.displayHeaders,
        displayColumnIds: data.displayColumnIds,
        rows: data.rows,
        displayColumnFallback: data.displayColumnFallback,
      })
      setHeaders(normalized.displayHeaders)
      setColIds(normalized.displayColumnIds)
      setRows(normalized.rows)
      const infoParts: string[] = []
      if (data.message?.trim()) {
        infoParts.push(data.message.trim())
      }
      if (data.displayColumnFallback || normalized.clientAppliedFallback) {
        infoParts.push(MSG_GA_EXCEL_COLUMN_FALLBACK)
      }
      setInfo(infoParts.join(' '))
    } catch (e) {
      console.warn('[useGaCustomerExcelData] fetch failed', { customerId, error: e })
      setError(MSG_GA_EXCEL_FETCH_FAILED)
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [token, customerId])

  useEffect(() => {
    void load()
  }, [load])

  const sortedRows = useMemo(() => {
    if (sortIdx == null || sortIdx < 0 || sortIdx >= colIds.length) {
      return rows
    }
    const key = colIds[sortIdx]
    const copy = [...rows]
    copy.sort((a, b) => {
      const va = String(a.cells[key] ?? '')
      const vb = String(b.cells[key] ?? '')
      const c = va.localeCompare(vb, 'ko')
      return sortAsc ? c : -c
    })
    return copy
  }, [rows, colIds, sortIdx, sortAsc])

  const onHeaderClick = useCallback(
    (idx: number) => {
      if (sortIdx === idx) {
        setSortAsc((v) => !v)
      } else {
        setSortIdx(idx)
        setSortAsc(true)
      }
    },
    [sortIdx],
  )

  const clearColumnSort = useCallback(() => {
    setSortIdx(null)
    setSortAsc(true)
  }, [])

  return {
    loading,
    error,
    info,
    headers,
    colIds,
    sortedRows,
    sortIdx,
    sortAsc,
    onHeaderClick,
    clearColumnSort,
    reload: load,
  }
}
