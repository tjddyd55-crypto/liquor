import { Link } from 'react-router-dom'
import { BusinessInfoFooter } from '../components/BusinessInfoFooter'

export function IntroductionPage() {
  const structureItems = [
    { title: '원수사', points: ['상품 정보', '공지', '시책공지'] },
    { title: 'GA', points: ['공지 관리', '자료 공유'] },
    { title: 'FC', points: ['고객관리', '상담', '청구', '클라우드서비스'], accent: true },
    { title: '고객', points: ['자료 확인', '소식지 수신', '청구요청'] },
  ] as const

  const flowItems = [
    { title: 'GA -> FC', desc: '공지 등록 -> 자동 전달' },
    { title: 'FC -> 고객', desc: '고객 등록 -> 상담 -> 파일 -> 청구' },
    { title: 'FC -> 고객', desc: '소식지 작성 -> 자동 전달' },
  ] as const

  const featureItems = [
    { title: '고객관리', lines: ['고객 정보 통합', '보험 데이터 관리'] },
    { title: '상담관리', lines: ['상담 기록', '히스토리 관리'] },
    { title: '파일관리', lines: ['고객별 파일 저장', '클라우드 기반'] },
    { title: '청구관리', lines: ['청구 서류 업로드', '진행 상태 관리'] },
    { title: '소식지', lines: ['FC -> 고객 전달', 'GA -> FC 전달'] },
    { title: '조직관리', lines: ['팀 관리', '내부 공유'] },
  ] as const

  const valueItems = [
    { title: '시간 절약', desc: '엑셀 / 카톡 / 파일 관리 제거' },
    { title: '실수 감소', desc: '자동화로 누락 방지' },
    { title: '매출 집중', desc: '고객 상담에 집중' },
  ] as const

  return (
    <main className="intro-v2">
      <section className="intro-v2-hero">
        <div className="intro-v2-hero__bg" />
        <div className="intro-v2-shell intro-v2-hero__inner">
          <div className="intro-v2-logo">FA-OA</div>
          <h1>보험 업무, 이제 하나로 끝.</h1>
          <p>고객관리 · 상담 · 파일 · 청구 · 소식지까지 모든 업무를 하나로 통합</p>
          <div className="intro-v2-badges">
            <span>FC 전용</span>
            <span>올인원 시스템</span>
            <span>자동화 플랫폼</span>
          </div>
          <Link className="intro-v2-btn intro-v2-btn--primary" to="/introduction/install">
            다운로드
          </Link>
        </div>
      </section>

      <section className="intro-v2-section intro-v2-section--white">
        <div className="intro-v2-shell">
          <header className="intro-v2-title">
            <h2>핵심 구조</h2>
            <p>정보가 자연스럽게 흐르는 통합 시스템</p>
          </header>
          <div className="intro-v2-structure">
            {structureItems.map((item, index) => (
              <div key={item.title} className="intro-v2-structure__group">
                <article className={`intro-v2-structure-card${item.accent ? ' is-accent' : ''}`}>
                  <h3>{item.title}</h3>
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </article>
                {index < structureItems.length - 1 ? <div className="intro-v2-arrow">↓</div> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-v2-section intro-v2-section--paper">
        <div className="intro-v2-shell">
          <header className="intro-v2-title">
            <h2>실제 사용 흐름</h2>
            <p>업무가 자동으로 연결됩니다</p>
          </header>
          <div className="intro-v2-flow-grid">
            {flowItems.map((item) => (
              <article key={`${item.title}-${item.desc}`} className="intro-v2-flow-card">
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-v2-section intro-v2-section--soft">
        <div className="intro-v2-shell">
          <header className="intro-v2-title">
            <h2>핵심 기능</h2>
            <p>필요한 모든 기능이 한 곳에</p>
          </header>
          <div className="intro-v2-feature-grid">
            {featureItems.map((item) => (
              <article key={item.title} className="intro-v2-feature-card">
                <h3>{item.title}</h3>
                <div>
                  {item.lines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-v2-section intro-v2-section--white">
        <div className="intro-v2-shell">
          <header className="intro-v2-title">
            <h2>핵심 가치</h2>
            <p>FA-OA가 제공하는 차별화된 가치</p>
          </header>
          <div className="intro-v2-value-grid">
            {valueItems.map((item) => (
              <article key={item.title} className="intro-v2-value-card">
                <h3>{item.title}</h3>
                <p>{item.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="intro-v2-cta">
        <div className="intro-v2-shell intro-v2-cta__inner">
          <h2>
            이 프로그램 하나로
            <br />
            보험 영업의 모든 업무가 해결됩니다.
          </h2>
          <p>이제 관리가 아니라 고객에 집중하세요.</p>
          <Link className="intro-v2-btn intro-v2-btn--white" to="/introduction/install">
            다운로드
          </Link>
        </div>
      </section>
      <BusinessInfoFooter />
    </main>
  )
}
