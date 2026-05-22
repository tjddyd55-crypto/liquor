import { staffSendSessionDisplayLabel } from '../sendSessionStaffDisplay'

type Props = {
  sessionStatus: string
  hasSignedNotCompleted?: boolean
}

export function SendSessionStatusBadge({ sessionStatus, hasSignedNotCompleted }: Props) {
  const label = staffSendSessionDisplayLabel(sessionStatus, { hasSignedNotCompleted })
  return (
    <span
      className="contract-signature-console__status-badge contract-status-badge"
      data-status={sessionStatus}
    >
      {label}
    </span>
  )
}
