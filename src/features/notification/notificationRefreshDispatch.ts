/** 알림 뱃지(unread-count)를 벨 컴포넌트와 무관하게 갱신할 때 사용 */
export const NOTIFICATION_REFRESH_EVENT = 'insurance-notifications-refresh'

export function dispatchNotificationRefresh(): void {
  window.dispatchEvent(new Event(NOTIFICATION_REFRESH_EVENT))
}
