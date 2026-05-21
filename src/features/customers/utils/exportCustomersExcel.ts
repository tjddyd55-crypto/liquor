import { saveAs } from 'file-saver'
import * as XLSX from 'xlsx'
import type { CustomerRecord } from '../domain/types'
import { customerNoteItems } from '../domain/types'

export const EXCEL_COLUMN_META = [
  { id: 'name', label: '이름' },
  { id: 'ssn', label: '주민번호' },
  { id: 'phone', label: '전화번호' },
  { id: 'address', label: '주소' },
  { id: 'height', label: '키' },
  { id: 'weight', label: '몸무게' },
  { id: 'job', label: '직업' },
  { id: 'driving', label: '운전여부' },
  { id: 'carType', label: '차종' },
  { id: 'memo', label: '메모' },
] as const

export type ExcelColumnId = (typeof EXCEL_COLUMN_META)[number]['id']

const COLUMN_IDS = new Set<string>(EXCEL_COLUMN_META.map((c) => c.id))

function drivingLabel(c: CustomerRecord): string {
  if (c.isDriver === true) {
    return '운전함'
  }
  if (c.isDriver === false) {
    return '운전 안함'
  }
  return (c.driving ?? '').trim()
}

function cellValue(c: CustomerRecord, col: ExcelColumnId): string {
  switch (col) {
    case 'name':
      return c.name ?? ''
    case 'ssn':
      return c.ssn ?? ''
    case 'phone':
      return c.phone ?? ''
    case 'address':
      return c.address ?? ''
    case 'height':
      return c.height ?? ''
    case 'weight':
      return c.weight ?? ''
    case 'job':
      return c.job ?? ''
    case 'driving':
      return drivingLabel(c)
    case 'carType':
      return c.carType ?? ''
    case 'memo':
      return customerNoteItems(c)
        .map((n) => n.content)
        .join('\n')
    default:
      return ''
  }
}

export function exportCustomersExcel(rows: CustomerRecord[], columnIds: string[], baseFilename = '고객목록'): void {
  const ids = columnIds.filter((id): id is ExcelColumnId => COLUMN_IDS.has(id))
  if (ids.length === 0) {
    throw new Error('다운로드할 컬럼을 하나 이상 선택해 주세요.')
  }
  const header = ids.map((id) => EXCEL_COLUMN_META.find((m) => m.id === id)!.label)
  const dataRows = rows.map((c) => ids.map((id) => cellValue(c, id)))
  const sheet = XLSX.utils.aoa_to_sheet([header, ...dataRows])
  sheet['!cols'] = ids.map(() => ({ wch: 20 }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, sheet, '고객')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true })
  const today = new Date().toISOString().slice(0, 10)
  const filename = `${baseFilename}_${today}.xlsx`
  saveAs(
    new Blob([out], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    filename,
  )
}
