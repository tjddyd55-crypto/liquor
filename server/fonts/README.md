# 서버 PDF 한글 폰트

이 폴더에 배치된 한글 폰트는 다음 두 기능이 **공유**해서 사용한다:

1. `server/lib/consentPdfFill.js` — 보험사 동의서 PDF 자동 채움
2. `server/pdf-engine/renderer/fontProvider.js` — 좌표 기반 PDF 자동화 엔진

두 기능 모두 한글 텍스트를 원본 PDF 위에 스탬핑한다. `pdf-lib` 의 기본 Helvetica 는 한글 글리프가
없으므로, 한글을 쓰려면 **임베드 폰트 파일**이 반드시 필요하다.

## 현재 상태 — 리포 번들 (기본값)

다음 파일을 레포에 직접 포함한다. 추가 배포 작업 없이 `npm install && npm start` 만으로 한글 PDF 가 동작한다.

- `server/fonts/NotoSansKR-Regular.otf` — Noto Sans KR Regular 한글 서브셋 (~4.5MB, OTF)
- `server/fonts/OFL.txt` — SIL Open Font License 1.1 원문

출처: [notofonts/noto-cjk Sans2.004 릴리스 — `17_NotoSansKR.zip`](https://github.com/notofonts/noto-cjk/releases/tag/Sans2.004).

### 왜 리포에 포함했나

- dev/CI/prod 환경을 동일하게 맞추기 위함. 외부 다운로드·볼륨 마운트·환경변수 설정 단계를 제거.
- `pdf-lib` 는 *임베드 폰트 바이너리가 필요*하므로 CDN/웹폰트 로는 대체 불가.
- OFL-1.1 은 상용 재배포 허용. 조건은 원본 폰트를 단독으로 판매하지 않는 것뿐.

## 환경변수 오버라이드 (선택)

운영에서 더 최신 버전이나 다른 서브셋을 쓰고 싶으면 `CONSENT_FONT_PATH` 환경변수에 **절대 경로**를
지정한다. 이 환경변수가 있으면 리포 번들보다 우선한다 (동의서·PDF 엔진이 공용으로 해석).

## 누락 시 동작

- 동의서: 한글이 포함된 요청은 400 을 반환한다.
- PDF 엔진: 500 을 반환하며 로그에 "한글 폰트 파일을 찾을 수 없습니다" 를 남긴다.
  (조용히 Helvetica 로 떨어지면 한글이 깨져 출력되므로, 명시적 실패가 안전하다.)
