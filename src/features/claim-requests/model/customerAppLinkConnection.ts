import type { CustomerAppLinkInfo } from '../api/claimRequestsApi'

export type CustomerAppConnectionState = 'not_created' | 'link_created' | 'connected' | 'expired'

export function resolveCustomerAppConnectionState(linkStatus: CustomerAppLinkInfo | null): CustomerAppConnectionState {
  const state = linkStatus?.connectionState
  if (state === 'not_created' || state === 'link_created' || state === 'connected' || state === 'expired') {
    return state
  }
  if (!linkStatus || !linkStatus.linkCode) {
    return 'not_created'
  }
  const status = String(linkStatus.status ?? '').toLowerCase()
  const expiresAtMs = linkStatus.expiresAt ? new Date(linkStatus.expiresAt).getTime() : null
  const expiredByTime = expiresAtMs != null && Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()
  if (expiredByTime || status === 'expired' || status === 'revoked' || status === 'disabled') {
    return 'expired'
  }
  if (Boolean(linkStatus.lastConnectedAt) || Number(linkStatus.deviceCount ?? 0) > 0) {
    return 'connected'
  }
  return 'link_created'
}

export type CustomerAppConnectionMeta = {
  title: string
  subtitle: string
  className: string
}

export function describeCustomerAppConnection(
  connectionState: CustomerAppConnectionState,
  linkStatus: CustomerAppLinkInfo | null,
  formatDateTime: (iso: string | null) => string,
): CustomerAppConnectionMeta {
  switch (connectionState) {
    case 'connected':
      return {
        title: '앱 연결됨',
        subtitle: linkStatus?.lastConnectedAt
          ? `최근 접속: ${formatDateTime(linkStatus.lastConnectedAt)}`
          : '최근 접속 정보 없음',
        className: 'claim-requests-page__status-value claim-requests-page__status-value--ok',
      }
    case 'link_created':
      return {
        title: '링크 생성됨',
        subtitle: '아직 접속 전',
        className: 'claim-requests-page__status-value claim-requests-page__status-value--pending',
      }
    case 'expired':
      return {
        title: '링크 만료',
        subtitle: '재생성 필요',
        className: 'claim-requests-page__status-value claim-requests-page__status-value--expired',
      }
    case 'not_created':
    default:
      return {
        title: '미연결',
        subtitle: '링크 미생성',
        className: 'claim-requests-page__status-value',
      }
  }
}

export function customerAppLinkActionLabel(connectionState: CustomerAppConnectionState): string {
  switch (connectionState) {
    case 'link_created':
    case 'connected':
      return '링크 재생성'
    case 'expired':
      return '새 링크 생성'
    case 'not_created':
    default:
      return '링크 생성'
  }
}

export const CUSTOMER_APP_LINK_UPDATED_EVENT = 'insurance:customer-app-link-updated'

export function notifyCustomerAppLinkUpdated(): void {
  window.dispatchEvent(new Event(CUSTOMER_APP_LINK_UPDATED_EVENT))
}
