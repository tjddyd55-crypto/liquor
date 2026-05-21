import { DOWNLOAD_LINKS } from '../constants/downloadLinks'
import { FormButton } from '../../../components/form'
import { downloadCustomerUploadSampleXlsx } from '../../customers/utils/customerExcelUpload'
import { BusinessInfoFooter } from '../components/BusinessInfoFooter'

const GPT_PROMPT_TEXT = `다음 작업을 수행해줘.

[목표]
기존 고객 엑셀 데이터를, 제공한 "샘플 엑셀 양식"과 100% 동일한 구조로 변환하여 작성해줘.
(업로드 시 오류가 발생하지 않도록 데이터 형식까지 정확히 맞출 것)

---

[입력 데이터]

1. 기존 고객 데이터 엑셀 파일
2. 샘플 엑셀 양식 파일

---

[작업 지시]

1. 샘플 엑셀의 컬럼명, 컬럼 순서, 구조를 절대 변경하지 말고 그대로 유지한다.
2. 기존 데이터의 각 항목을 샘플 양식에 맞게 정확하게 매핑한다.
3. 매핑이 애매한 경우, 가장 유사한 항목에 넣고 그 기준을 함께 설명한다.

---

[데이터 형식 규칙 - 매우 중요]

1. 주민번호, 휴대폰번호, 차량번호, 계좌번호 등은 반드시 "텍스트 형식"으로 처리한다.
   (숫자 변환 금지, 앞자리 0 절대 유지)
2. 주민번호와 휴대폰번호는 "샘플 양식 기준"을 따른다.
   * 샘플에 하이픈이 없으면 -> 숫자만 입력
   * 샘플에 하이픈이 있으면 -> 동일하게 입력
3. 날짜는 반드시 아래 형식으로 통일한다 -> yyyy-mm-dd
4. 빈 값은 데이터 없으면 빈칸 유지, "없음", "null", "-" 입력 금지
5. 모든 셀은 줄바꿈 없이 한 줄로 작성한다 (Enter 금지)
6. 텍스트 앞뒤 공백 제거 (trim 처리)
7. 특수문자 및 불필요한 기호 제거

---

[데이터 정리 규칙]

1. 동일 고객이 중복될 경우 하나로 정리한다 (주민번호 기준)
2. 주소는 하나의 필드로 합쳐서 작성한다 (줄바꿈 금지)
3. 긴 텍스트는 줄바꿈 없이 한 줄로 정리
4. 숫자 데이터는 자동 변환되지 않도록 반드시 텍스트 처리
5. 성별은 주민번호 기준으로 자동 판단하여 입력한다
   * 1, 3 -> 남성
   * 2, 4 -> 여성
   * 기타 값은 빈칸 처리

---

[출력 형식]

1. 결과는 "샘플 엑셀 구조 그대로" 유지하여 출력한다
2. 먼저 표 형태로 보여주고, 이후 엑셀 파일로 다운로드 가능하게 제공한다

---

[중요]

* 샘플 엑셀 구조 절대 변경 금지
* 데이터 형식 오류 없이 업로드 가능해야 함
* 데이터 정확성이 가장 중요

---

[추가 요청]

변환 결과에서 다음 항목을 함께 검증해줘:
* 주민번호 길이 이상 여부 (13자리)
* 전화번호 형식 오류 여부 (11자리)
* 필수값 누락 여부
* 성별 자동 판별 불가 데이터

문제가 있는 데이터는 따로 표시해줘.
문의가 필요한 경우 관리자에게 요청해 주세요.`

const PC_STEPS = [
  '위의 PC 다운로드 버튼을 눌러 설치 파일을 다운로드한다',
  '다운로드된 파일을 실행한다',
  '설치 화면 안내에 따라 설치를 진행한다',
  '설치 완료 후 프로그램을 실행한다',
]

const FC_MOBILE_STEPS = [
  'FC 모바일 APK를 다운로드한다',
  '휴대폰 설정에서 알 수 없는 앱 설치 허용을 켠다',
  '다운로드한 APK를 눌러 설치를 진행한다',
  '설치 완료 후 앱 실행 후 로그인한다',
]

const DOWNLOAD_CARDS = [
  {
    key: 'pc',
    title: 'PC 버전 다운로드',
    description: 'Windows에서 설치 후 바로 사용할 수 있는 프로그램입니다',
    href: DOWNLOAD_LINKS.pc,
    buttonLabel: 'PC 다운로드',
    badge: '설계사용',
    icon: 'PC',
    customer: false,
  },
  {
    key: 'fc',
    title: '모바일 APK 다운로드',
    description: '안드로이드 휴대폰에 직접 설치하는 파일입니다',
    href: DOWNLOAD_LINKS.fcMobile,
    buttonLabel: 'APK 다운로드',
    badge: '설계사용',
    icon: 'APK',
    customer: false,
  },
  {
    key: 'customer',
    title: '고객앱 다운로드',
    description: '고객이 소식 확인, 청구 요청, 자료 확인에 사용하는 전용 앱',
    href: DOWNLOAD_LINKS.customerApp,
    buttonLabel: '고객앱 다운로드',
    badge: null,
    icon: 'APP',
    customer: true,
  },
] as const

export function IntroductionInstallPage() {
  return (
    <main className="intro-install">
      <section className="intro-install-hero">
        <div className="intro-v2-shell">
          <h1>보험 신청·고객관리<br />설치 및 업로드 안내</h1>
          <p>보험 FC 업무용 프로그램 설치 안내</p>
          <p>PC 버전 또는 모바일 APK를 설치하고</p>
          <p>연락처 엑셀 파일을 작성해 업로드하세요</p>
          <div className="intro-install-hero__actions">
            <a href={DOWNLOAD_LINKS.pc} target="_blank" rel="noreferrer">PC 다운로드</a>
            <a href={DOWNLOAD_LINKS.fcMobile} target="_blank" rel="noreferrer">FC 모바일</a>
            <a className="is-customer" href={DOWNLOAD_LINKS.customerApp} target="_blank" rel="noreferrer">고객앱</a>
          </div>
        </div>
      </section>

      <section className="intro-install-section">
        <div className="intro-v2-shell">
          <header className="intro-install-title">
            <h2>프로그램 다운로드</h2>
            <p>사용 환경에 맞는 버전을 선택하세요</p>
          </header>
          <div className="intro-install-download-grid">
            {DOWNLOAD_CARDS.map((card) => (
              <article
                key={card.key}
                className={`intro-install-download-card${card.customer ? ' intro-install-download-card--customer' : ''}`}
              >
                <div className="intro-install-download-card__head">
                  <div className={`intro-install-download-card__icon${card.customer ? ' is-customer' : ''}`}>
                    <span>{card.icon}</span>
                  </div>
                  <div className="intro-install-download-card__title-wrap">
                    <h3>{card.title}</h3>
                    {card.badge ? <span className="intro-install-download-card__badge">{card.badge}</span> : null}
                  </div>
                </div>
                <p>{card.description}</p>
                <a href={card.href} target="_blank" rel="noreferrer">
                  <span className="intro-install-download-card__btn-icon" aria-hidden="true">↓</span>
                  {card.buttonLabel}
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-install-section intro-install-section--soft">
        <div className="intro-v2-shell">
          <header className="intro-install-title">
            <h2>설치 방법 안내</h2>
            <p>각 버전별 설치 과정을 따라하세요</p>
          </header>
          <div className="intro-install-guide-grid">
            <article className="intro-install-guide-card">
              <h3>PC 설치 방법</h3>
              <ol>
                {PC_STEPS.map((step, index) => (
                  <li key={step}><span>{index + 1}</span>{step}</li>
                ))}
              </ol>
              <div className="intro-install-guide-note">설치 중 경고창이 나오면 신뢰된 앱으로 허용한 뒤 계속 진행하세요.</div>
            </article>
            <article className="intro-install-guide-card">
              <h3>설계사 APK 설치 방법</h3>
              <ol>
                {FC_MOBILE_STEPS.map((step, index) => (
                  <li key={step}><span>{index + 1}</span>{step}</li>
                ))}
              </ol>
              <div className="intro-install-guide-note">Android 13 이상에서는 앱별 설치 권한을 추가로 허용해야 할 수 있습니다.</div>
            </article>
          </div>
        </div>
      </section>

      <section className="intro-install-section">
        <div className="intro-v2-shell">
          <header className="intro-install-title">
            <h2>연락처 엑셀 업로드 안내</h2>
            <p>샘플 형식과 동일한 구조로 작성해야 정상 업로드됩니다.</p>
          </header>
          <div className="intro-install-alert">컬럼명, 순서, 빈칸 규칙이 다르면 업로드 실패 가능성이 큽니다.</div>
          <div className="intro-install-upload-box">
            <ol>
              <li>샘플 파일 다운로드</li>
              <li>엑셀 고객 정보 입력</li>
              <li>앱 또는 웹에서 연락처 업로드 메뉴 이동</li>
              <li>작성한 파일 선택 후 업로드</li>
            </ol>
            <a
              href="#sample-download"
              onClick={(event) => {
                event.preventDefault()
                downloadCustomerUploadSampleXlsx()
              }}
            >
              샘플 파일 다운로드
            </a>
          </div>
        </div>
      </section>

      <section className="intro-install-section intro-install-section--soft">
        <div className="intro-v2-shell">
          <header className="intro-install-title">
            <h2>GPT 변환 요청 방법</h2>
            <p>샘플 양식과 기존 데이터를 업로드한 뒤 아래 프롬프트를 사용하세요.</p>
          </header>
          <article className="intro-install-prompt">
            <FormButton
              htmlType="button"
              variant="secondary"
              onClick={() => navigator.clipboard?.writeText(GPT_PROMPT_TEXT)}
            >
              복사하기
            </FormButton>
            <pre>{GPT_PROMPT_TEXT}</pre>
          </article>
        </div>
      </section>

      <section className="intro-install-cta">
        <div className="intro-v2-shell">
          <h2>설치와 업로드 순서 요약</h2>
          <p>프로그램 설치 -&gt; 샘플 다운로드 -&gt; 엑셀 작성 -&gt; 업로드</p>
          <div className="intro-install-cta__actions">
            <a href={DOWNLOAD_LINKS.pc} target="_blank" rel="noreferrer">PC 다운로드</a>
            <a href={DOWNLOAD_LINKS.fcMobile} target="_blank" rel="noreferrer">FC 모바일</a>
            <a href={DOWNLOAD_LINKS.customerApp} target="_blank" rel="noreferrer">고객앱</a>
          </div>
        </div>
      </section>
      <BusinessInfoFooter />
    </main>
  )
}

