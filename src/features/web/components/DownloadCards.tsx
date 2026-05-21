type Props = {
  pcUrl: string
  apkUrl: string
}

export function DownloadCards({ pcUrl, apkUrl }: Props) {
  return (
    <section className="intro-card">
      <h2 className="intro-section-title">다운로드</h2>
      <div className="intro-grid">
        <article className="intro-panel">
          <h3 className="intro-panel-title">PC 버전 다운로드</h3>
          <p className="intro-panel-text">Windows에서 설치 후 바로 사용할 수 있는 프로그램</p>
          <a className="intro-btn intro-btn--secondary" href={pcUrl} target="_blank" rel="noreferrer">
            PC 다운로드
          </a>
        </article>
        <article className="intro-panel">
          <h3 className="intro-panel-title">모바일 APK 다운로드</h3>
          <p className="intro-panel-text">안드로이드 휴대폰에 직접 설치하는 파일</p>
          <a className="intro-btn intro-btn--secondary" href={apkUrl} target="_blank" rel="noreferrer">
            APK 다운로드
          </a>
        </article>
      </div>
    </section>
  )
}
