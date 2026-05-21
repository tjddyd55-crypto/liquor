import type { ReactNode } from 'react'

type CustomersPagePCViewProps = {
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

export default function CustomersPagePCView({
  isSelectMode,
  showExcelToolbar,
  excelToolbarNode,
  headerNode,
  bodyNode,
  columnPickerNode,
  scrollTopNode,
  createExitConfirmNode,
  confirmDialogNode,
}: CustomersPagePCViewProps) {
  return (
    <main
      className={`page customers-page customers-page--pc page--with-back${
        isSelectMode && showExcelToolbar ? ' customers-page--excel-toolbar-pad' : ''
      }`}
    >
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
