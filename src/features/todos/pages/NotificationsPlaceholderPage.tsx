import ResponsiveLayout from '../../../components/ResponsiveLayout'

function NotificationsPlaceholderPCView() {
  return (
    <main className="page notifications-placeholder-page notifications-placeholder-page--pc page--with-back content-wrapper page-shell bg-[#0b111a] text-[#e5e7eb]">
      <h1 className="text-xl font-semibold text-[#f8fafc]">알림</h1>
      <div className="mt-4 rounded-xl border border-[#1e293b] bg-[#111827] p-4 max-w-[640px] text-[#cbd5e1] leading-relaxed">
        알림 기능은 준비 중입니다. 추후 청구, 만기, 고객 요청, 문서 서명, 지정 알림 등을 이곳에서 확인할 수 있습니다.
      </div>
    </main>
  )
}

function NotificationsPlaceholderMobileView() {
  return (
    <main className="page notifications-placeholder-page notifications-placeholder-page--mobile page--with-back content-wrapper page-shell bg-[#0b111a] text-[#e5e7eb] pb-6">
      <h1 className="text-lg font-semibold text-[#f8fafc]">알림</h1>
      <div className="mt-3 rounded-xl border border-[#1e293b] bg-[#111827] p-3 text-sm text-[#cbd5e1] leading-relaxed">
        알림 기능은 준비 중입니다. 추후 청구, 만기, 고객 요청, 문서 서명, 지정 알림 등을 이곳에서 확인할 수 있습니다.
      </div>
    </main>
  )
}

export default function NotificationsPlaceholderPage() {
  return <ResponsiveLayout PC={NotificationsPlaceholderPCView} Mobile={NotificationsPlaceholderMobileView} />
}
