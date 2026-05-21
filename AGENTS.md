# 에이전트 작업 규칙

이 저장소에서 AI 에이전트가 지켜야 하는 **배포/브랜치 규칙**입니다. 모든 세션에서 반드시 이 파일을 먼저 읽고 따를 것.

**제품 방향(CRM 고객관리 템플릿 빌더):** 기능 스코프·우선순위는 `docs/architecture/crm-template-builder-direction.md`에 고정해 두었으며, 배포 규칙과 별도의 기준이다.

**정부지원 CRM (`government-support`):** 보험 CRM을 **마스터로 복제**한다. 새 UI/UX 설계 금지. 상세·우선순위·매핑은 `docs/architecture/government-crm-architecture.md` **§0** 및 `.cursor/rules/government-insurance-copy.mdc`를 따른다. 작업 브랜치는 **develop만** (production/main·보험 DB 금지).

---

## 1. 브랜치 전략

| 브랜치 | 역할 | 배포 트리거 |
|---|---|---|
| `develop` | **기본 작업 브랜치**. 모든 기능·수정은 먼저 여기로. | 없음(테스트 전용) |
| `main` | **운영 반영 브랜치**. 푸시되는 순간 실제 배포. | Railway 웹 · GitHub Actions 데스크톱/모바일 OTA |

## 2. 커밋·푸시 워크플로 (엄격)

```
작업 → develop 커밋 → develop 푸시 → [여기서 멈춤]
                                        ↓
                        사용자가 "머지" 류 지시를 명시적으로 한 경우에만
                                        ↓
                    develop → main 머지(fast-forward) → main 푸시
```

### 반드시 지킬 것

- `main`은 **사용자의 명시적 지시**가 있을 때만 건드린다.
  - 해당되는 지시 예: "머지해줘", "main 머지 푸시", "배포해줘", "업데이트 반영해" 등.
  - 애매하면 먼저 물어본다. 임의로 merge 하지 않는다.
- 머지는 `--ff-only` 우선. 이력 분기가 발생하면 원인부터 조사한다.
- `main`에 직접 커밋 금지. 모든 변경은 develop을 경유한다.
- `git push --force` 류 명령은 **절대 금지**. 사용자가 명시적으로 요구해도 main/develop에는 force push를 하지 않는다.

## 3. 배포 파이프라인 (Railway 서비스 ↔ 브랜치)

### 3-1. 서비스별 Source Branch 매핑 (진실 표)

| 환경 | URL | 관찰해야 할 브랜치 | 역할 |
|---|---|---|---|
| **dev** | `insurance-dev-production.up.railway.app` | **`develop`** | develop 반영 즉시 검증용. 운영 영향 없음 |
| **prod** | `insurance-production-7bd8.up.railway.app` | **`main`** | 실제 사용자 서비스 |

> **중요**: dev 서비스의 source branch가 `main`으로 되어 있으면 develop 검증 자체가 불가능해진다 (develop에 아무리 푸시해도 dev URL이 반응하지 않거나, main 머지 후에야 바뀐다). Railway Dashboard → 해당 서비스 → Settings → Source → Connect Branch가 **반드시 `develop`** 이어야 한다. 이 설정을 바꾸는 사람은 이 문서를 같이 수정한다.

### 3-2. main 푸시 시 자동으로 일어나는 일

main에 푸시되면 **동시에 3개 채널**이 갱신되므로 머지 타이밍은 신중해야 한다.

1. **Railway prod(웹)** — prod 서비스 자동 재배포
2. **Electron 데스크톱 앱** — `.github/workflows/deploy.yml`이 Windows exe 빌드 후 릴리스에 publish
3. **모바일 OTA** — `mobile-ota.yml`, `customer-mobile-ota.yml`이 EAS Update 배포. 설계사 앱·고객 앱 모두

### 3-3. develop 푸시 시 자동으로 일어나는 일

- **Railway dev(웹)만** 자동 재배포된다 (3-1 매핑이 올바른 경우).
- Electron 데스크톱·모바일 OTA 워크플로는 `on.push.branches: [main]`이므로 develop 푸시로는 **트리거되지 않는다**. 이는 의도된 설계(운영 채널 보호).

### 3-4. 파이프라인 이상 진단

"develop에 푸시했는데 dev URL이 바뀌지 않음"이라면 다음 순서로 의심한다.

1. Railway Dashboard에서 dev 서비스의 **Source Branch가 `develop`인지** 확인 (가장 흔한 원인).
2. dev 서비스의 최근 빌드가 실패했는지 (Deployments 탭) 확인.
3. GitHub Actions `deploy.yml`·`*-ota.yml`이 develop에도 돌도록 잘못 확장되어 있지는 않은지 확인 (현 상태는 `main`만 트리거, 유지할 것).
4. DevTools Console에 `[apiClient] stale Railway API host ignored …` 경고가 뜬다면 `.env.production`에 prod 호스트가 다시 박혔는지 확인 (3-5 위반). dev 번들이 prod 호스트를 가리키는 순간 검증 신뢰도가 무너진다.
5. **PC에서 고객관리 우측 패널이 사라지거나, PC 전용 CSS(문자/전화 아이콘 숨김 등)가 적용되지 않는다**면 `useIsMobile()`이 true로 오판정됐을 확률이 가장 높다. PC가 F12를 열거나 창을 좁게 쓸 때도 반드시 PC UI가 유지되어야 한다. 판정식은 `(max-width: 768px) and (pointer: coarse)` 로, `pointer: coarse` 조건을 제거하지 말 것(§8-3 참고).

### 3-5. 환경변수 주입 원칙 (API/BASE URL)

다음 규칙은 "dev와 prod가 같은 빌드 산출물을 써도 각자 자기 호스트에 붙는다"는 불변식을 만들기 위함이다.

| 실행 환경 | `VITE_API_URL` / `VITE_BASE_URL` | 실제 API base | 근거 |
|---|---|---|---|
| Web (Railway dev) | **미설정** | same-origin `/backend` | `src/lib/apiClient.ts` `resolveApiBasePath()` |
| Web (Railway prod) | **미설정** | same-origin `/backend` | 동일 |
| Desktop (Electron, 패키지) | **빌드 타임에 prod 호스트 주입** | 주입된 절대 URL | `file://`이라 same-origin이 없음 |
| 로컬 개발 (`npm run dev`) | (선택) | `vite` dev proxy가 `/backend` → `localhost:3001` 프록시 | `vite.config.ts` |

- `.env.production`에 절대로 `VITE_API_URL` / `VITE_BASE_URL`을 하드코딩하지 않는다. 해당 파일은 의도 설명 주석만 둔다.
- Electron 빌드는 `.github/workflows/deploy.yml`의 `Build and publish Electron` 스텝에서 env 주입.
- Electron을 **로컬에서 수동 패키징**할 때는 동일 env를 셸에서 주입한다.

  ```powershell
  $env:VITE_API_URL="https://insurance-production-7bd8.up.railway.app"
  $env:VITE_BASE_URL="https://insurance-production-7bd8.up.railway.app"
  npm run build:desktop
  ```

- `src/lib/publicOrigin.ts`의 `getPublicOrigin()`은 `VITE_BASE_URL`이 없으면 `window.location.origin`으로 폴백하므로, 웹 dev/prod 모두 올바른 자기 호스트로 초대 링크·자원 URL을 만든다. 이 폴백을 제거하지 말 것.

## 4. 체크리스트 (작업 종료 전)

- [ ] develop에만 푸시했는가? (사용자가 머지를 요구하지 않았다면 여기서 종료)
- [ ] 머지 요청이 있었다면, develop이 main보다 앞서 있고 분기 없이 선형인가?
- [ ] 머지 후 main 푸시까지 완료했는가?
- [ ] 사용자에게 "어디에(develop/main) 무엇을 반영했는지" 명확히 보고했는가?

## 5. 커밋 메시지 규칙

Conventional Commits 기반. 한국어/영어 혼용 가능하지만 접두사는 영어.

```
feat(scope): 새 기능
fix(scope): 버그 수정
refactor(scope): 동작 변화 없는 구조 개선
chore(scope): 빌드·의존성·설정
docs(scope): 문서
```

`scope` 예: `customers`, `customers-pc`, `customers-mobile`, `auth`, `api`, `deploy`.

### 모달 UX 절대 규칙

새 모달·다이얼로그를 만들거나 `Modal` / `BaseDialog` 사용 방식을 바꿀 때 아래를 **기본 계약**으로 둔다.

1. **입력·수정·삭제·업로드**가 포함된 모달은 **바깥(백드롭) 클릭으로 닫히면 안 된다.** (`closeOnBackdrop={false}` 등)
2. **단순 조회·안내** 모달만 백드롭 클릭 닫기를 허용할 수 있다.
3. 입력값이 바뀐 뒤 **취소·X·Escape**로 닫으려 하면 확인을 띄운다. 문구 예: `변경사항이 저장되지 않았습니다. 닫으시겠습니까?` — 확인 시에만 닫기, 취소 시 모달 유지. **저장 성공 후** 자동 닫기는 확인 없음.
4. 긴 폼 모달은 **header / body / footer** 구조로 나눈다.
5. footer의 **저장·취소** 등 주요 버튼은 **항상 보이게** 하고, **body만 스크롤** (`body`: `overflow-y: auto`; 패널은 `max-height` + flex column).
6. **PC**에서 필드가 많으면 **2열 이상** 그리드를 우선하고, **모바일**(너비 좁음)에서는 **1열**로 전환한다.
7. 저장·삭제 등 **되돌리기 어려운 액션**은 확인·명확한 라벨 등으로 실수를 방지한다.
8. Escape 처리: 폼 모달은 `BaseDialog`의 `onEscapeRequest`로 통일해 미저장 확인 후 닫는다. **확인 모달이 포커스일 때**는 상위 모달의 Escape 핸들러가 중복 반응하지 않도록 `nestedConfirmBlockingRef` 패턴 등으로 막는다.
9. **넓은 폼 모달**은 `Modal` / `BaseDialog`의 **`panelPreset="largeForm"`** 을 쓴다. 이렇게 하면 기본 `w-[90%] max-w-md p-4` 가 붙지 않고 `min(1080px,92vw)`·`max-h-[86vh]`·flex 셸이 Tailwind로 고정된다 (배포 번들에서 좁은 패널로 보이는 회귀 방지).

구현 참고: `src/features/insurer-sites/pages/AdminInsurerSitesPage.tsx` (보험사 설계사이트 추가·수정), `src/components/dialog/BaseDialog.tsx` (`onEscapeRequest`, `panelPreset`).

## 6. 라인 엔딩 주의

Windows 환경에서 `core.autocrlf=true`로 인해 `git status`에 수백 개 파일이 M으로 보이는 경우가 있다. 이는 대부분 **실제 내용 변경이 아닌 CRLF 경고**이므로 `git diff --ignore-cr-at-eol --name-only`로 실제 변경 파일만 추려서 명시적으로 `git add <파일>` 할 것. `git add .` 사용 금지(의도치 않은 대량 커밋 방지).

> **TODO(별도 단독 커밋)**: 프로젝트 루트에 `.gitattributes`(`* text=auto eol=lf` + 바이너리 지정)를 추가하고 `git add --renormalize .`로 일괄 재정규화한다. 수백 파일짜리 단독 커밋이어야 하며 기능 커밋과 섞지 않는다. 실행은 큰 릴리스 직후 조용한 시점에.

## 7. 작업 인프라

### 7-1. worktree

- `D:/workspace/insurance-main-sync` 는 **main 브랜치 전용 worktree**다. 본 저장소(`D:/workspace/insurance`)는 상시 develop에 머물게 하고, main 머지·푸시만 이 worktree에서 수행하기 위한 용도.
- 덕분에 develop 작업 도중 브랜치 스위칭 없이 main 반영이 가능하다. 함부로 삭제하지 말 것.
- 추가 worktree를 만들 경우 이 파일에 용도를 명기한다.

### 7-2. Cursor Project Rules

- 경로: `.cursor/rules/*.mdc` (신형 포맷)
- 각 `.mdc`는 상단 front matter로 `description` / `globs` / `alwaysApply` 지정. 레거시 `rules.json`·`.md` 금지.
- 예: `.cursor/rules/r2-storage.mdc` — R2 업로드 기본 경로 규칙.

### 7-3. EAS Update 채널

- `apps/mobile/eas.json`, `apps/customer-mobile/eas.json`에 정의된 **빌드 프로필 채널만 publish 대상**이다 (`development` / `preview` / `main`).
- `default` 채널처럼 구독하는 빌드가 없는 채널로 publish 하지 말 것. 도달 대상 없이 EAS API 호출만 낭비한다.

## 8. PC/Mobile UI 분리 규칙

> 제품 원칙: **"모바일은 앱처럼, PC는 웹처럼"**. 두 플랫폼은 같은 데이터/로직을 공유하지만 UI 레이어는 **서로 오염되지 않도록** 분리한다.

### 8-1. 현재 분리 상태(스냅샷)

| 페이지 | View 파일 분리 | modifier 클래스 | container 분기 방식 |
|---|---|---|---|
| `CustomersPage` | ✅ PCView/MobileView | ✅ `.customers-page--pc/--mobile` | 직접 분기(상세 로직 공유, 별도 리팩토링 주제) |
| `ClaimRequestsPage` | ✅ PCView/MobileView | ✅ `.claim-requests-page--pc/--mobile` | 부분 분기(공통 body + wrapper만 다름) |
| `ApplicationPage` | ✅ PCView/MobileView | — CSS scope 수요 없음(실제 화면은 동일 컴포넌트) | ✅ `ResponsiveLayout` 표준 사용 |
| `CustomerWorkspaceLayout` | ✅ LayoutPC/LayoutMobile | — CSS scope 수요 없음 | 부분 분기(좌측 공통, 우측만 분기) |
| `CustomerGaExcelPage` | ✅ PagePC/PageMobile | ✅ `.customer-ga-excel-page--pc/--mobile` | ✅ `ResponsiveLayout` + 전용 훅(`useGaCustomerExcelData`) |
| `MemoRoutePage` | ✅ PCView/MobileView | ✅ `.memo-route-page--pc` 만 사용(Mobile 은 modifier 미부착: 분리 전과 1:1 동일 마크업 유지, [아래 예외 노트](#memo-mobile-modifier-exception) 참조) | ✅ `ResponsiveLayout` (placeholder — 훅 불필요) |
| 그 외 페이지(20+ 파일) | ❌ 단일 파일 내부에서 `useIsMobile` 분기 | ❌ 없음 | ❌ |

- "CSS scope 수요 없음" = index.css에 `.<page>-page--pc/--mobile`·`.pc-root .<page>-page` 규칙이 0건. CSS가 생길 때 modifier를 부착한다(선제 추상화 금지).
- 완성도는 기능 수정 PR마다 점진적으로 끌어올린다. 이 표가 "진행 현황"의 단일 출처다.

<a id="memo-mobile-modifier-exception"></a>
**`MemoRoutePage` Mobile modifier 예외**
`MemoRouteMobileView` 는 `<div className="memo-route-page">` 만 부착한다(`--mobile` 생략).
이유: 하위 `MainWorkspaceLayout` 이 자체 `workspace-root` flex 컨테이너를 가지므로 상위 `.memo-route-page` 에 modifier 스타일이 얹히면 내부 flex 높이 계산이 어긋나 **메모 패널이 찌그러지는 회귀**가 발생한다(실제 발생 사례). "분리 전 모바일 화면과 렌더 1:1 동일" 이라는 업무 요구와 결합해 이 페이지만 예외로 다룬다. 이 예외는 `MemoRouteMobileView.tsx` 상단 docblock 에도 명시되어 있다.

**레이아웃 스캐폴딩 단일 진실 원천 — 앱 메뉴**
`DashboardPage`, `AppWorkspaceLayoutPCShell`, `AppWorkspaceLayoutMobileShell` 세 호출처가 보여주는 메뉴 리스트는 반드시 같아야 한다(과거 "대시보드엔 있는데 햄버거엔 없다" 류 회귀를 구조적으로 차단).
- 유일한 빌더: `src/features/dashboard/gaTenantMenu.ts` 의 **`buildAppMenuForSession(role, gaCode, gaName, { includeMemo, teamMenuManageVisible })`**.
- 옵션 정책:
  - `includeMemo: true`  — 모바일 대시보드 / 모바일 드로어 (우측 상시 메모 패널 없음).
  - `includeMemo: false` — PC 사이드바 / PC 대시보드 (우측 메모 패널 상시).
  - `teamMenuManageVisible` — 팀 오너일 때만 `/team/files` 바로 뒤에 "팀 관리" 주입. 자리 고정 → 세 호출처 모두 같은 위치.
- 메뉴 항목을 추가/이동할 때는 반드시 이 빌더만 수정한다. 각 호출처에서 재구성하지 않는다.

**모바일 드로어는 오버레이**
모바일 햄버거 메뉴는 `position: fixed` 오버레이 + backdrop 이다. 본문 DOM 을 밀어내지 않는다.
- 컴포넌트: `src/layouts/AppWorkspaceLayout.tsx` `AppWorkspaceLayoutMobileShell`.
- 스타일: `.mobile-workspace-drawer--overlay`, `.mobile-workspace-drawer-backdrop` (src/index.css).
- z-index 정책: backdrop=900, drawer=901, mobile modal overlay=9999, confirm dialog=10000. 드로어가 모달 위로 올라오지 않도록 의도적으로 하위 레이어에 둔다.

**모바일 메모 리스트 / FAB 구성**
모바일 `MainWorkspaceLayout` 하단 메모 영역은 다음 3요소로 구성된다.
- **한 줄 핸들 바** `.memo-mobile-list-handle` — 높이 24px, 중앙에 `▼` / `▲` 만 표시. "메모 목록" 같은 레이블 텍스트는 두지 않는다(자리만 차지). `collapsed` 여부는 `--collapsed` modifier.
- **리스트 박스** `.memo-list-sidebar.mobile-list.memo-mobile-list` — 높이 220px, 5개 이상 항목이 스크롤 없이 보이도록 설정. 내부 `MemoList` 는 `hideHeader` 로 호출 → `MemoSidebar` 의 제목·정리하기·토글 헤더 전체 생략.
- **듀얼 FAB** `.memo-electron-fab-dock--mobile` — 우하단 같은 위치에 `[추가]` `[정리]` 두 pill 버튼을 가로로 배치. 각 버튼은 메뉴 팝업 없이 즉시 동작(`addNote()` / `handleAutoArrange()`). PC/웹 에서는 기존 단일 `+` FAB + 메뉴 팝업을 유지한다.

컴포넌트 경계:
- `MemoMobileListSection` / `MemoPcListSection` (둘 다 `src/layouts/MainWorkspaceLayout.tsx` 내부) 로 모바일/PC 하단 리스트 UI 를 완전히 분리 — 한쪽 수정이 다른 쪽에 흘러들지 않는다.
- `MemoElectronFabDock` 의 `isMobile` 분기가 FAB 형태를 결정한다.

### 8-2. 핵심 원칙 (신규·수정 코드에 적용)

1. **View 파일 분리 우선**  
   새 페이지는 반드시 다음 구조로 만든다.
   ```
   features/<feature>/pages/<page>Page.tsx          ← container(데이터·라우팅)
   features/<feature>/pages/<page>/<page>PCView.tsx ← PC 전용 UI
   features/<feature>/pages/<page>/<page>MobileView.tsx ← 모바일 전용 UI
   ```
   container는 **`src/components/ResponsiveLayout`**을 재사용해 분기한다. `useIsMobile()`을 container에서 직접 호출하지 않는다.
   ```tsx
   import ResponsiveLayout from '../../../components/ResponsiveLayout'
   export default function ExamplePage() {
     return <ResponsiveLayout PC={ExamplePCView} Mobile={ExampleMobileView} />
   }
   ```
   같은 역할의 신규 추상화(`ResponsiveSwitch` 등)는 만들지 않는다. 개선은 `ResponsiveLayout` 자체를 고친다.

   **View 가 props 를 필요로 하는 경우 (`viewProps`)**  
   같은 View 가 다른 호출부(예: 모달)에서도 props 기반으로 재사용되는 경우엔
   훅 자가조달로 바꿀 수 없다. 이때는 `ResponsiveLayout` 의 generic `viewProps`
   옵션을 사용한다.
   ```tsx
   type ViewProps = { error: string; rows: Row[]; onSubmit: () => void }
   <ResponsiveLayout<ViewProps>
     PC={ExamplePCView}
     Mobile={ExampleMobileView}
     viewProps={{ error, rows, onSubmit }}
   />
   ```
   두 View 는 **동일한 props 시그니처**를 가져야 한다. PC 전용 핸들러가 있으면
   Mobile 쪽에서 `Pick`/`Omit` 으로 맞추지 말고 두 View 가 공통 시그니처를
   받도록 정리한다 (Mobile 에서 안 쓰는 핸들러는 호출하지 않으면 그만).

   **예외 — "페이지 대부분이 공통, 소수 섹션만 플랫폼 한정" 인 경우**  
   페이지 전체를 View 파일로 쪼개면 공통 마크업이 중복 복제되어 유지보수성이 오히려
   악화된다. 이 경우엔 페이지 파일 하나를 유지하되, 플랫폼 한정 섹션은
   **`src/components/PCOnlySection`** (또는 향후 추가될 `MobileOnlySection`) 으로 감싼다.
   ```tsx
   import PCOnlySection from '../../../components/PCOnlySection'
   // 페이지 내부 어딘가
   <section>
     <h2>...</h2>
     <PCOnlySection>
       <FeaturePanel /> {/* PC 에서만 유의미, 모바일에서는 안내 박스로 대체 */}
     </PCOnlySection>
   </section>
   ```
   `ResponsiveLayout` 과 `PCOnlySection` 은 **스코프가 다르다**. 전자는 *페이지 전체*,
   후자는 *페이지 내부 섹션 하나*. 중복 추상화가 아니므로 둘 다 유지한다.
   페이지 컨테이너에서 `useIsMobile()` 을 직접 호출하는 대신 이 둘 중 하나로 수렴시켜
   원칙 4 를 지킨다.

2. **CSS는 modifier 패턴 고정**  
   View의 최상위 요소에 다음 클래스를 부여한다.
   ```tsx
   <main className="page <page>-page <page>-page--pc page--with-back">...</main>
   <main className="page <page>-page <page>-page--mobile page--with-back">...</main>
   ```
   페이지 스코프 CSS는 반드시 이 modifier를 prefix로 사용한다.
   - 허용: `.customers-page--pc .customer-card__actions { ... }`
   - 금지: `.pc-root .customers-page .customer-card__actions { ... }` (신규 추가 금지)

3. **`.pc-root` / `.mobile-root` 신규 사용 금지**  
   전역 레이아웃(`AppWorkspaceLayout`, `AppLayout`, `ElectronTitleBar` 등 페이지 무관 공용 영역)에서만 허용. **페이지·기능 스코프에서는 새로 추가하지 않는다.** 기존 것은 마주칠 때마다 해당 페이지 modifier로 점진 이관한다.

4. **분리된 View 내부에서 `useIsMobile` 사용 금지**  
   `XXXPCView` 안에서 "이 요소만 모바일일 때..." 같은 예외를 만들지 않는다. 분기가 필요하다면 container로 올린다.

5. **공유 컴포넌트는 props로 분기**  
   같은 컴포넌트를 두 플랫폼이 모두 쓸 경우, 컴포넌트는 `variant="pc" | "mobile"` 같은 명시적 prop으로만 분기한다. 컴포넌트 내부에서 `useIsMobile()`을 호출해 스스로 판단하는 코드는 금지.

6. **`useIsMobile` 판정식 고정**  
   `src/hooks/useIsMobile.ts`의 미디어 쿼리는 **`(max-width: 768px) and (pointer: coarse)`** 이다. `pointer: coarse`를 제거하거나 width 단독으로 되돌리면 "PC에서 DevTools 열거나 창 좁게 쓰면 우측 패널·PC CSS가 통째로 사라지는" 버그가 재발한다(실제 사례 있음). 정의상 이 hook은 **"레이아웃용 실모바일 기기 여부"** 이지 "뷰포트 폭"이 아니다.

### 8-3. 신규 페이지 체크리스트

- [ ] `PageContainer` / `PagePCView` / `PageMobileView` 3파일 구조인가?
- [ ] 최상위 요소에 `*-page--pc` / `*-page--mobile` modifier를 붙였는가?
- [ ] 페이지 스코프 CSS가 **modifier prefix로만** 작성되었는가?
- [ ] View 내부에 `useIsMobile` 호출이 없는가?
- [ ] 공유 컴포넌트 내부에 `useIsMobile` 호출이 없는가? (있다면 prop으로 올림)

### 8-4. 기존 미분리 페이지 이관 가이드

당장 전부 분리하지 않는다. 다음 우선순위로 기회가 생길 때마다 옮긴다.

1. 해당 페이지를 기능적으로 수정할 일이 생기면 **함께** 분리 PR로 묶는다.
2. 분리 순서: (a) `PCView`/`MobileView` 파일 생성 → (b) container에서 `ResponsiveLayout` 사용 → (c) CSS를 modifier prefix로 재작성 → (d) 구 `.pc-root`/`.mobile-root` 규칙 삭제.
3. 한 PR에 한 페이지만 이관. 대량 리팩토링 PR은 회귀 범위 파악이 어려우므로 금지.

> **원칙**: "기능 작업이 없는데 UI 분리만을 위한 PR"은 만들지 않는다. 리팩토링은 항상 기능 변경과 함께 한다.

### 8-5. `useIsMobile` 사용 현황 및 분리 난이도 분류 (2026-04-16 기준)

향후 페이지별 분리 작업 시 난이도/전략을 미리 파악할 수 있도록 분류해 둔다. 실제 분리는 각 페이지의 기능 수정 PR에서 수행한다.

#### Tier 0 — 분리 대상 아님 (훅/추상화 자체)

| 파일 | 비고 |
|---|---|
| `src/hooks/useIsMobile.ts` | 원본 훅 |
| `src/components/ResponsiveLayout.tsx` | 공용 분기 추상화(표준) |
| `src/hooks/useGlobalBackHandler.ts` | 동작 분기 훅(UI 아님). 모바일 전용 back 동작 |

#### Tier 1 — 전역 레이아웃 (현 위치 유지, `.pc-root/.mobile-root` 허용 영역)

| 파일 | 역할 |
|---|---|
| `src/AppLayout.tsx` | 앱 루트 레이아웃 |
| `src/layouts/AppWorkspaceLayout.tsx` | 작업공간 루트(`.pc-root`/`.mobile-root` 부여 지점) |
| `src/layouts/MainWorkspaceLayout.tsx` | 메인 레이아웃 |

→ 페이지 스코프 규칙이 아니므로 `useIsMobile` 직접 호출 허용. 다만 변경 시 레이아웃 격변 영향이 크므로 신중히.

#### Tier 2 — 단순 치환 후보 (기능 작업 시 `ResponsiveLayout`으로 이관 권장)

| 파일 | 현재 분기 횟수 | 비고 |
|---|---|---|
| `features/application/pages/ApplicationPage.tsx` | ✅ 완료 | ResponsiveLayout 표준 적용 완료 |
| `features/auth/pages/LoginPage.tsx` | ✅ 완료 | 3파일 구조 (PCView/MobileView) + 공통 `LoginForm` · `LoginPageVersionFooter` + `useLoginController` 훅. CSS modifier(`auth-page--login-split` / `auth-page--mobile-login`) 는 기존 네이밍 유지 |
| `features/auth/pages/ProfilePage.tsx` | ✅ 완료 | 페이지는 단일 파일 유지(공통 540줄 + PC 한정 섹션 2곳). `PCOnlySection` 으로 섹션 분기를 수렴해 `useIsMobile` 직접 호출 제거. ResponsiveLayout 분리 대상 아님 (섹션 분기 예외) |
| `features/insurer-news/pages/InsurerManagerNewsListPage.tsx` | ✅ 완료 | 3파일 구조 (PCView/MobileView) + 공통 타입 `insurerManagerNewsListViewProps.ts` + `ResponsiveLayout<ViewProps>` 치환. 상세 조회·모달·zoom 상태는 PC View 내부 보유 (Mobile 은 라우트 이동이라 불필요). 공개 props 시그니처 유지로 `NewsletterHubPage` / `LossAdjusterManagerNewsListPage` 영향 없음 |
| `features/customers/pages/CustomerGaExcelPage.tsx` | ✅ 완료 | ResponsiveLayout + 전용 훅(`useGaCustomerExcelData`) + modifier 적용 완료 |
| `features/customers/pages/CustomerConsultationsPage.tsx` | ✅ 완료 | `ResponsiveLayout<CustomerConsultationsViewProps>` 치환 + 공통 타입 `customerConsultationsViewProps.ts` 도입. Mobile 에 삭제 버튼 추가(UX 일관성). 모바일 모달(`CustomerConsultationsModal`) 에도 삭제 지원 추가 + `BaseDialog` z-[10000] 로 조정해 모달 위에 confirm 이 뜨도록 함 |
| `features/memo/pages/MemoRoutePage.tsx` | ✅ 완료 | 3파일 구조 (PCView/MobileView) + `.memo-route-page--pc/--mobile` modifier 적용 완료 (데이터 없는 placeholder 라 훅은 두지 않음) |

#### Tier 3 — 복합 분기 (View 쪼개기 + 로직 검토 필요)

| 파일 | 상태 · 비고 |
|---|---|
| `features/insurer-news/components/NewsCard.tsx` | ✅ 완료 — 내부 `useIsMobile()` 제거, `variant: 'pc' \| 'mobile'` 필수 prop 승격. 호출측 `NewsletterList` 도 `variant` 를 받아 그대로 전달하며, 최상위 컨테이너(`ClaimRequestsPage`) 가 자신의 `isMobile` 로부터 결정해 주입한다 (AGENTS §8-5 Tier 4 패턴). |
| `features/customers/pages/CustomersPage.tsx` | ✅ 완료 — 내부 `CustomerListCard` memo 서브컴포넌트의 `useIsMobile()` 호출을 제거하고 `variant` 필수 prop 으로 승격. 컨테이너(`CustomersPage`) 의 `useIsMobile` 은 **행동 분기** 전용으로 유지(모바일 전용 모달 open·history pushState·WebView 스크롤 전략·최종 View dispatch). UI 토글 분기는 없다. |
| `features/claim-requests/pages/ClaimRequestsPage.tsx` | ✅ 완료 — `pageContent` 내부의 유일한 UI 분기(`!isMobile ?` PC 전용 detail 패널) 를 `PCOnlySection` 으로 치환. 컨테이너의 `useIsMobile` 은 **행동 분기** 전용(모바일 상세 모달 open trigger + 최종 View dispatch + `NewsCard` variant prop 주입) 으로 유지. 공통 body 를 children 으로 전달하는 PC/Mobile wrapper 2개는 기능 동등성을 위해 유지. |
| `features/customers/pages/CustomerWorkspaceLayout.tsx` | ✅ 완료 — 우측 panel 분기(`{!isMobile ? PC : Mobile}`) 를 `ResponsiveLayout<CustomerWorkspaceLayoutPCProps>` 로 수렴. Mobile View 는 동일 props 시그니처를 받고 무시(null 반환). 이 파일은 `features/customers/pages/` 아래에 있지만 실질은 **layout 역할**(좌측 공통 목록 + 우측 panel 분기) 이므로 AGENTS §8-5 Tier 1 등가로 본다. `useEffect` 내부의 `isMobile` 가드는 모바일에서 불필요한 PC 전용 데이터 fetch 를 건너뛰기 위한 행동 분기이며, Tier 1 규칙상 허용된다. |

#### Tier 4 — 컴포넌트 내부 분기 (prop으로 승격)

| 파일 | 상태 · 비고 |
|---|---|
| `features/storage/components/StorageToolbar.tsx` | ✅ 완료 — 이미 `isMobile: boolean` prop 을 받고 있었음. 내부 훅 호출 없음 (현행 유지) |
| `features/storage/components/StorageWorkspace.tsx` | ✅ 완료 — `variant: 'pc' \| 'mobile'` **필수** prop 도입, 내부 `useIsMobile` 제거. 기존 단일 호출처였던 `MyStoragePage` 는 `ResponsiveLayout<MyStorageViewProps>` + `MyStoragePagePCView` / `MyStoragePageMobileView` 로 분리해 variant 를 명시 주입 |
| `features/memo/components/MemoElectronFabDock.tsx` | ✅ 완료 — `isMobile?: boolean` prop 을 받아 PC/Mobile UI 를 분기(단일 `+` FAB vs. `[추가]/[정리]` 듀얼 pill). 훅 직접 호출 없음. `MainWorkspaceLayout`(Tier 1) 에서 주입 |
