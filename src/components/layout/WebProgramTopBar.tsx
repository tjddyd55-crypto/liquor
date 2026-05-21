/**
 * 웹(비 Electron) 데스크톱에서만 보이는 상단 프로그램 느낌 바.
 * Electron 은 기존 ElectronTitleBar 를 사용한다.
 */
export function WebProgramTopBar() {
  return (
    <div className="web-program-top-bar" role="presentation">
      <span className="web-program-top-bar__title">보험 신청·고객관리</span>
    </div>
  )
}
