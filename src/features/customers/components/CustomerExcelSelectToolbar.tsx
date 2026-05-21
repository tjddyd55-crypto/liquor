import type { Dispatch, KeyboardEvent, RefObject, SetStateAction } from 'react'
import { FormButton, FormInput } from '../../../components/form'
import { EXCEL_COLUMN_META } from '../utils/exportCustomersExcel'

export type CustomerExcelSelectToolbarProps = {
  variant: 'toolbar' | 'modal'
  tab: 'list' | 'create'
  isSelectMode: boolean
  isColumnPickerOpen: boolean
  setIsColumnPickerOpen: Dispatch<SetStateAction<boolean>>
  selectAllRef: RefObject<HTMLInputElement | null>
  allVisibleSelected: boolean
  selectedColumns: string[]
  allVisibleIds: string[]
  onToggleSelectAll: () => void
  handleDownloadSelected: () => void
  handleDownloadListAll: () => void
  exitExcelSelectMode: () => void
  toggleExcelColumn: (id: string) => void
}

export default function CustomerExcelSelectToolbar(props: CustomerExcelSelectToolbarProps) {
  if (props.variant === 'toolbar') {
    return (
      <div className="customers-excel-toolbar" role="region" aria-label="엑셀 다운로드 선택">
        <p className="customers-excel-toolbar__status">
          엑셀 선택 중 —「선택 다운로드」는 체크한 고객,「목록 전체 다운로드」는 지금 검색·필터·정렬된 목록만
        </p>
        <div className="customers-excel-toolbar__row">
          <label className="customers-excel-toolbar__select-all">
            <FormInput
              ref={props.selectAllRef}
              type="checkbox"
              checked={props.allVisibleSelected}
              onChange={props.onToggleSelectAll}
            />
            전체 선택
          </label>
          <FormButton
            htmlType="button"
            variant="action"
            className="filter-button"
            onClick={() => props.setIsColumnPickerOpen(true)}
          >
            컬럼 선택
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className="cta-button"
            onClick={props.handleDownloadSelected}
          >
            선택 다운로드
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className="cta-button"
            onClick={props.handleDownloadListAll}
          >
            목록 전체 다운로드
          </FormButton>
          <FormButton
            htmlType="button"
            variant="action"
            className="filter-button"
            onClick={props.exitExcelSelectMode}
          >
            취소
          </FormButton>
        </div>
      </div>
    )
  }

  return (
    <div
      className="modal-overlay"
      role="presentation"
      onClick={() => props.setIsColumnPickerOpen(false)}
      onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
          props.setIsColumnPickerOpen(false)
        }
      }}
    >
      <div
        className="modal modal-excel-columns"
        role="dialog"
        aria-modal="true"
        aria-labelledby="excel-columns-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="excel-columns-title">엑셀에 포함할 항목</h3>
        <div className="modal-body">
          <ul className="modal-excel-columns__list">
            {EXCEL_COLUMN_META.map((col) => (
              <li key={col.id} className="modal-excel-columns__item">
                <label>
                  <FormInput
                    type="checkbox"
                    checked={props.selectedColumns.includes(col.id)}
                    onChange={() => props.toggleExcelColumn(col.id)}
                  />
                  {col.label}
                </label>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-actions">
          <FormButton
            htmlType="button"
            variant="action"
            className="confirm"
            onClick={() => props.setIsColumnPickerOpen(false)}
          >
            닫기
          </FormButton>
        </div>
      </div>
    </div>
  )
}
