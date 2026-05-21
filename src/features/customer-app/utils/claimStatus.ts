export type CustomerClaimStatus = 'requested' | 'processing' | 'done' | 'rejected' | 'canceled'

type StatusMeta = {
  label: string
  className: string
}

const STATUS_META: Record<CustomerClaimStatus, StatusMeta> = {
  requested: {
    label: '요청됨',
    className: 'customer-app-claim-status--requested',
  },
  processing: {
    label: '처리중',
    className: 'customer-app-claim-status--processing',
  },
  done: {
    label: '완료',
    className: 'customer-app-claim-status--done',
  },
  rejected: {
    label: '반려',
    className: 'customer-app-claim-status--rejected',
  },
  canceled: {
    label: '취소',
    className: 'customer-app-claim-status--canceled',
  },
}

export function resolveClaimStatusMeta(statusRaw: string | null | undefined): StatusMeta {
  const key = String(statusRaw ?? '').trim().toLowerCase() as CustomerClaimStatus
  return STATUS_META[key] ?? {
    label: String(statusRaw ?? '알 수 없음'),
    className: 'customer-app-claim-status--unknown',
  }
}
