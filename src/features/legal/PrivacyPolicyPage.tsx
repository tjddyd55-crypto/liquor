import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { privacySiteConfig as C } from './privacySiteConfig'

function setOrCreateMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

export default function PrivacyPolicyPage() {
  useEffect(() => {
    const prevTitle = document.title
    const descEl = document.querySelector('meta[name="description"]')
    const prevDescription = descEl?.getAttribute('content') ?? ''

    document.title = C.documentTitle
    setOrCreateMeta('description', C.metaDescription)
    setOrCreateMeta('robots', C.metaRobots)

    return () => {
      document.title = prevTitle
      setOrCreateMeta('description', prevDescription)
    }
  }, [])

  return (
    <main className="legal-doc-page" id="privacy-policy-top">
      <article className="legal-doc">
        <header className="legal-doc__header">
          <p className="legal-doc__meta">
            시행일 {C.effectiveDate} · 개정일 {C.lastRevisedDate}
          </p>
          <h1 className="legal-doc__title">개인정보처리방침</h1>
          <p className="legal-doc__lead">
            {C.operatorLegalName}(이하 &quot;회사&quot;)는 「개인정보 보호법」 등 관련 법령을 준수하며,{' '}
            {C.serviceName}
            (이하 &quot;서비스&quot;) 이용과 관련하여 정보주체의 개인정보를 보호하고 권익을 보호하기 위하여 다음과
            같은 처리방침을 둡니다.
          </p>
        </header>

        <nav className="legal-doc__toc" aria-label="목차">
          <strong className="legal-doc__toc-title">목차</strong>
          <ol className="legal-doc__toc-list">
            <li>
              <a href="#s1">개인정보의 처리 목적</a>
            </li>
            <li>
              <a href="#s2">처리하는 개인정보 항목</a>
            </li>
            <li>
              <a href="#s3">개인정보의 처리 및 보유 기간</a>
            </li>
            <li>
              <a href="#s4">개인정보의 제3자 제공</a>
            </li>
            <li>
              <a href="#s5">개인정보 처리의 위탁</a>
            </li>
            <li>
              <a href="#s6">정보주체와 법정대리인의 권리·의무 및 행사방법</a>
            </li>
            <li>
              <a href="#s7">개인정보의 파기</a>
            </li>
            <li>
              <a href="#s8">개인정보의 안전성 확보 조치</a>
            </li>
            <li>
              <a href="#s9">쿠키 등 사용에 관한 사항</a>
            </li>
            <li>
              <a href="#s10">개인정보 보호책임자 및 연락처</a>
            </li>
            <li>
              <a href="#s11">정보주체의 권익침해 구제방법</a>
            </li>
            <li>
              <a href="#s12">개인정보 처리방침의 변경</a>
            </li>
          </ol>
        </nav>

        <section className="legal-doc__section" id="s1">
          <h2>제1조 개인정보의 처리 목적</h2>
          <p>
            회사는 서비스 제공·유지·개선, 이용자 식별 및 본인 확인, 고객 상담, 고지·통지, 부정 이용 방지, 법령상
            의무 이행 등을 위해 필요한 범위에서 개인정보를 처리합니다. 보험 신청·고객 정보 관리 기능을 제공하는
            서비스 특성상, 신청서·고객 카드에 기재되는 정보는 해당 업무 처리 및 사후 관리 목적에 이용됩니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s2">
          <h2>제2조 처리하는 개인정보 항목</h2>
          <p>회사는 서비스 이용 과정에서 아래와 같은 개인정보를 처리할 수 있습니다.</p>
          <ul className="legal-doc__list">
            <li>
              <strong>회원·계정</strong>: 아이디, 비밀번호(암호화 저장), 서비스 이용 기록, 접속 로그, IP 주소 등
            </li>
            <li>
              <strong>고객·신청 정보</strong>: 성명, 생년월일 또는 주민등록번호 등 식별정보, 연락처(전화번호),
              주소, 직업, 차량·보험 관련 정보, 기타 신청서에 입력하거나 업무상 필요한 정보
            </li>
            <li>
              <strong>민감정보</strong>: 관련 법령에 따른 동의·고지 절차가 필요한 경우, 법이 허용하는 범위와
              동의를 받은 목적 내에서만 처리합니다.
            </li>
          </ul>
          <p>
            실제 수집 항목은 앱·웹 화면의 입력 필드, 동의 절차 및 회사 내부 운영 정책에 따라 달라질 수 있으며,
            수집 시점에 안내됩니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s3">
          <h2>제3조 개인정보의 처리 및 보유 기간</h2>
          <p>
            회사는 법령에 따른 보관 의무가 있거나 정보주체로부터 별도 동의를 받은 기간 동안 개인정보를 보관합니다.
            관련 법령에 따라 보관해야 하는 경우 해당 기간까지 보관 후 지체 없이 파기합니다. 그 외에는 수집·이용
            목적 달성 시 지체 없이 파기합니다. 내부 방침에 따라 일정 기간 보관이 필요한 경우 사전에 고지합니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s4">
          <h2>제4조 개인정보의 제3자 제공</h2>
          <p>
            회사는 정보주체의 동의가 있거나 법률에 특별한 규정이 있는 경우를 제외하고는 개인정보를 제3자에게 제공하지
            않습니다. 제3자 제공이 필요한 경우 제공받는 자, 목적, 항목, 보유 기간 등을 정보주체에게 고지하고 동의를
            받습니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s5">
          <h2>제5조 개인정보 처리의 위탁</h2>
          <p>
            회사는 원활한 서비스 제공을 위해 개인정보 처리 업무를 외부에 위탁할 수 있습니다. 위탁 시 위탁받는 자,
            위탁 업무 내용, 위탁 기간 등을 개인정보 처리방침에 공개하고, 관련 법령에 따라 위탁 계약 등 필요한
            조치를 합니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s6">
          <h2>제6조 정보주체와 법정대리인의 권리·의무 및 행사방법</h2>
          <p>
            정보주체는 회사에 대해 언제든지 개인정보 열람·정정·삭제·처리정지 등을 요구할 수 있습니다. 권리 행사는
            개인정보 보호책임자에게 서면, 전자우편 등으로 요청하시면 지체 없이 조치하겠습니다. 다만 법령에서 열람
            또는 처리가 제한되는 경우에는 그에 따릅니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s7">
          <h2>제7조 개인정보의 파기</h2>
          <p>
            개인정보 보유 기간 경과, 처리 목적 달성 등 파기 사유가 발생한 경우 지체 없이 전자적 파일은 복구·재생되지
            않는 방법으로 삭제하고, 출력물 등은 분쇄 또는 소각 등으로 파기합니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s8">
          <h2>제8조 개인정보의 안전성 확보 조치</h2>
          <p>
            회사는 개인정보의 안전성 확보를 위해 관리적·기술적·물리적 보호조치를 취합니다. 예를 들어 접근 권한
            관리, 비밀번호 암호화, 전송 구간 보호, 접속 기록 보관, 내부 점검 등을 수행할 수 있습니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s9">
          <h2>제9조 쿠키 등 사용에 관한 사항</h2>
          <p>
            회사는 이용자에게 개별화된 서비스를 제공하기 위해 쿠키 등을 사용할 수 있습니다. 웹 브라우저 설정에서
            쿠키 저장을 거부할 수 있으나, 일부 기능 이용이 제한될 수 있습니다.
          </p>
        </section>

        <section className="legal-doc__section" id="s10">
          <h2>제10조 개인정보 보호책임자 및 연락처</h2>
          <p>
            회사는 개인정보 처리에 관한 업무를 총괄하는 개인정보 보호책임자를 지정하고 있습니다. 개인정보와 관련한
            문의·불만 처리·피해 구제는 아래로 연락 주시기 바랍니다.
          </p>
          <ul className="legal-doc__list legal-doc__contact">
            <li>
              <strong>상호</strong> {C.operatorLegalName}
            </li>
            <li>
              <strong>대표자</strong> {C.representativeName}
            </li>
            <li>
              <strong>사업자등록번호</strong> {C.businessRegistrationNumber}
            </li>
            <li>
              <strong>주소</strong> {C.address}
            </li>
            <li>
              <strong>개인정보 보호책임자</strong> {C.privacyOfficerName} ({C.privacyOfficerRole})
            </li>
            <li>
              <strong>이메일</strong>{' '}
              <a href={`mailto:${C.privacyEmail}`} className="legal-doc__link">
                {C.privacyEmail}
              </a>
            </li>
            <li>
              <strong>전화</strong>{' '}
              <a href={`tel:${C.privacyPhone.replace(/-/g, '')}`} className="legal-doc__link">
                {C.privacyPhone}
              </a>
            </li>
          </ul>
        </section>

        <section className="legal-doc__section" id="s11">
          <h2>제11조 정보주체의 권익침해 구제방법</h2>
          <p>
            개인정보 침해에 대한 신고·상담이 필요하신 경우 아래 기관에 문의하실 수 있습니다. (기관 명칭·연락처는
            행정기관 안내에 따라 변경될 수 있습니다.)
          </p>
          <ul className="legal-doc__list">
            <li>개인정보 침해신고센터: (국번없이) 118 / privacy.kisa.or.kr</li>
            <li>개인정보 분쟁조정위원회: 1833-6972 / www.kopico.go.kr</li>
            <li>대검찰청 사이버범죄수사단: 1301 / www.spo.go.kr</li>
            <li>경찰청 사이버수사국: (국번없이) 182 / cyberbureau.police.go.kr</li>
          </ul>
        </section>

        <section className="legal-doc__section" id="s12">
          <h2>제12조 개인정보 처리방침의 변경</h2>
          <p>
            이 개인정보 처리방침은 시행일로부터 적용되며, 법령·정책 또는 서비스 변경에 따라 내용의 추가·삭제·수정이
            있을 경우 변경사항 시행 7일 전부터 공지합니다. 다만 정보주체 권리에 중대한 영향을 미치는 경우 최소 30일
            전에 공지할 수 있습니다.
          </p>
        </section>

        <footer className="legal-doc__footer">
          <p className="legal-doc__footer-note">
            <Link to="/login" className="legal-doc__link">
              서비스 로그인
            </Link>
            <span aria-hidden="true"> · </span>
            <a href="#privacy-policy-top" className="legal-doc__link">
              맨 위로
            </a>
          </p>
        </footer>
      </article>
    </main>
  )
}
