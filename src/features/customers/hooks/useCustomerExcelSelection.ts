import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type UseCustomerExcelSelectionOptions = {
  /** `sortedCustomers` 기준 id 목록(문자열) — 기존 `allVisibleIds` 계산과 동일 */
  visibleCustomerIds: string[]
  defaultSelectedColumns: string[]
  onEnterExcelSelectMode?: () => void
}

export function useCustomerExcelSelection({
  visibleCustomerIds,
  defaultSelectedColumns,
  onEnterExcelSelectMode,
}: UseCustomerExcelSelectionOptions) {
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [selectedColumns, setSelectedColumns] = useState<string[]>([])
  const [isColumnPickerOpen, setIsColumnPickerOpen] = useState(false)
  const selectAllRef = useRef<HTMLInputElement | null>(null)

  const allVisibleIds = visibleCustomerIds

  const allVisibleSelected = useMemo(
    () => allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedCustomerIds.includes(id)),
    [allVisibleIds, selectedCustomerIds],
  )

  useEffect(() => {
    const el = selectAllRef.current
    if (!el) {
      return
    }
    const n = selectedCustomerIds.filter((id) => allVisibleIds.includes(id)).length
    el.indeterminate = n > 0 && n < allVisibleIds.length
  }, [selectedCustomerIds, allVisibleIds])

  const enterExcelSelectMode = useCallback(() => {
    onEnterExcelSelectMode?.()
    setIsSelectMode(true)
    setSelectedCustomerIds([])
    setSelectedColumns([...defaultSelectedColumns])
    setIsColumnPickerOpen(false)
  }, [onEnterExcelSelectMode, defaultSelectedColumns])

  const exitExcelSelectMode = useCallback(() => {
    setIsSelectMode(false)
    setSelectedCustomerIds([])
    setSelectedColumns([])
    setIsColumnPickerOpen(false)
  }, [])

  const toggleExcelColumn = useCallback((id: string) => {
    setSelectedColumns((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const toggleSelectAll = useCallback(() => {
    setSelectedCustomerIds((prev) => {
      const allSelected =
        allVisibleIds.length > 0 && allVisibleIds.every((id) => prev.includes(id))
      if (allSelected) {
        return prev.filter((id) => !allVisibleIds.includes(id))
      }
      return [...new Set([...prev, ...allVisibleIds])]
    })
  }, [allVisibleIds])

  const toggleCustomerSelection = useCallback((id: string) => {
    setSelectedCustomerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  return {
    isSelectMode,
    setIsSelectMode,
    selectedCustomerIds,
    setSelectedCustomerIds,
    selectedColumns,
    setSelectedColumns,
    isColumnPickerOpen,
    setIsColumnPickerOpen,
    selectAllRef,
    allVisibleIds,
    allVisibleSelected,
    enterExcelSelectMode,
    exitExcelSelectMode,
    toggleSelectAll,
    toggleCustomerSelection,
    toggleExcelColumn,
  }
}
