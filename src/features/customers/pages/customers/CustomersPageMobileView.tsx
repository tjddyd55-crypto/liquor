import type { ReactNode } from 'react'

type CustomersPageMobileViewProps = {
  isSelectMode: boolean
  showExcelToolbar: boolean
  excelToolbarNode: ReactNode
  headerNode: ReactNode
  bodyNode: ReactNode
  columnPickerNode: ReactNode
  scrollTopNode: ReactNode
  createExitConfirmNode: ReactNode
  confirmDialogNode: ReactNode
}

export default function CustomersPageMobileView({
  isSelectMode,
  showExcelToolbar,
  excelToolbarNode,
  headerNode,
  bodyNode,
  columnPickerNode,
  scrollTopNode,
  createExitConfirmNode,
  confirmDialogNode,
}: CustomersPageMobileViewProps) {
  return (
    <main
      className={`page customers-page customers-page--mobile page--with-back${
        isSelectMode && showExcelToolbar ? ' customers-page--excel-toolbar-pad' : ''
      }`}
    >
      <style>{`
        .customers-page--mobile .mobile-btn {
          height: 44px;
          min-height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          border: none;
          background: #2563eb;
          color: #fff;
          font-weight: 500;
          font-size: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .customers-page--mobile .mobile-btn:active {
          opacity: 0.85;
        }
        .customers-page--mobile .mobile-btn-outline {
          height: 44px;
          min-height: 44px;
          border-radius: 12px;
          background: transparent;
          border: 1px solid #374151;
          color: #e5e7eb;
        }
        .customers-page--mobile .mobile-customer-action-bar button,
        .customers-page--mobile .customer-detail-feature-actions--mobile button {
          height: 44px;
          min-height: 44px;
          padding: 0 14px;
          border-radius: 12px;
          border: none;
          background: #2563eb;
          color: #fff;
          font-weight: 500;
          font-size: 14px;
        }
        .customers-page--mobile .mobile-customer-action-bar button:active,
        .customers-page--mobile .customer-detail-feature-actions--mobile button:active {
          opacity: 0.85;
        }
      `}</style>
      {excelToolbarNode}
      {headerNode}
      {bodyNode}
      {columnPickerNode}
      {scrollTopNode}
      {createExitConfirmNode}
      {confirmDialogNode}
    </main>
  )
}
