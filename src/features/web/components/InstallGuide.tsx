const PC_STEPS = [
  '위의 PC 다운로드 버튼을 눌러 설치 파일을 다운로드한다.',
  '다운로드된 파일을 실행한다.',
  '설치 화면 안내에 따라 설치를 진행한다.',
  '설치 완료 후 프로그램을 실행한다.',
  '로그인 후 사용한다.',
]

const APK_STEPS = [
  '위의 APK 다운로드 버튼을 눌러 APK 파일을 다운로드한다.',
  '다운로드가 완료되면 파일을 터치하여 실행한다.',
  '처음 설치하는 경우 출처를 알 수 없는 앱 허용 또는 설치 허용 안내가 나올 수 있다.',
  '허용 또는 설정 변경 후 다시 설치를 진행한다.',
  '설치 완료 후 앱을 실행한다.',
  '로그인 후 사용한다.',
]

export function InstallGuide() {
  return (
    <section className="intro-card">
      <h2 className="intro-section-title">설치 방법 안내</h2>

      <div className="intro-guide-block">
        <h3 className="intro-guide-title">PC 설치 방법</h3>
        <ol className="intro-steps">
          {PC_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="intro-alert-box">
          회사 또는 PC 보안 설정에 따라 실행 확인 창이 나올 수 있습니다.
          <br />
          이 경우 계속 실행 또는 허용 후 설치를 진행하세요.
        </div>
      </div>

      <div className="intro-guide-block">
        <h3 className="intro-guide-title">모바일 APK 설치 방법</h3>
        <ol className="intro-steps">
          {APK_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="intro-alert-box intro-alert-box--strong">
          안드로이드에서는 APK 설치 시 보안 안내가 나올 수 있습니다.
          <br />
          안내에 따라 허용 후 설치하면 됩니다.
        </div>
      </div>
    </section>
  )
}
