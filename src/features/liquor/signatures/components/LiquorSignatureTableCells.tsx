import { formatEvidenceHashForTable, formatStaffSessionDateParts } from '../sendSessionStaffDisplay'

type DateCellProps = {
  iso: string | null | undefined
}

export function ContractTableDateCell({ iso }: DateCellProps) {
  const parts = formatStaffSessionDateParts(iso)
  if (!parts) {
    return <span className="contract-table-empty">—</span>
  }
  return (
    <div className="contract-table-date">
      <span>{parts.date}</span>
      <span>{parts.time}</span>
    </div>
  )
}

type HashCellProps = {
  prefix: string | null | undefined
}

export function ContractTableHashCell({ prefix }: HashCellProps) {
  const h = formatEvidenceHashForTable(prefix, 12)
  if (!h) {
    return <span className="contract-table-empty">—</span>
  }
  return (
    <div className="contract-table-hash" title={String(prefix).trim()}>
      {h}
    </div>
  )
}
