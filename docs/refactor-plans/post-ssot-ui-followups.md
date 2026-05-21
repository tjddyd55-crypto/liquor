# routing SSOT 이후 남은 UI 후속 이슈 — Handoff 노트

> **작성 시점**: `refactor/customers-routing-ssot` 브랜치 회귀 테스트 통과 직후
> **모체 PR**: `refactor(customers): routing SSOT 근본 정리` (`refactor/customers-routing-ssot` → `develop`)
> **계속 작업할 위치**: 기존 채팅방 (`D:\workspace\insurance-dev` worktree · develop HEAD)

---

## 0. 맥락

routing SSOT 리팩터 머지 전 회귀 테스트 과정에서 **리팩터 스코프 밖의 UI 회귀 4건** 이
추가로 드러났다. 전부 모체 PR 의 3개 파일(`CustomersPage.tsx` · routing-ssot.mdc ·
본 리팩터 handoff md) 과 무관하며, develop 의 최근 선행 커밋들이 원인으로 보인다.

스코프 오염을 막기 위해 **모체 PR 에는 포함하지 않고** 별도 브랜치에서 하나씩 정리한다.
이 문서는 그 작업을 이어받는 다음 세션이 **바로 착수할 수 있도록** 정리한 실행용 노트다.

---

## 1. 이슈 목록 요약

| # | 증상 | 귀속 커밋(추정) | 권장 브랜치 | 우선순위 |
|---|---|---|---|---|
| 1 | 로그아웃 메뉴가 하단 고정이 아니라 "내정보" 섹션 내부에 끼어있음 | `17aecb1` | `fix/sidebar-logout-position-and-hierarchy` | 중 |
| 2 | 대분류·소분류 타이포/들여쓰기 위계가 약해 한눈에 안 들어옴 | `17aecb1` | (1 과 같은 브랜치에서 처리) | 중 |
| 3 | `/memo` 진입 시 본문 검은 화면 · 하단 "추가/정리" 버튼만 노출 | `ddcd438` | `fix/memo-page-blank-on-entry` | **상** (기능 유실) |
| 4 | 모바일 모달을 하드웨어 뒤로가기로 닫으면 카드 내부 액션 버튼 색상이 활성 상태로 남음 | 미확정 (CSS · dismiss cleanup 경로) | `fix/mobile-modal-hw-back-button-state` | 중 |

---

## 2. 이슈별 상세

### §2.1 로그아웃 위치 + 메뉴 위계 (이슈 #1 · #2)

#### 증상
- 모바일 드로어(또는 사이드바) 하단에서 "로그아웃" 이 독립 영역이 아니라 "내정보" 섹션의 "내 저장공간" 엔트리 옆에 inline 으로 붙어있다. 섹션 구분이 무너져 보임.
- section 헤더(`고객메세지 / 소식지 / 팀관리 / 신청서 / 내정보`) 와 하위 항목의 **폰트 크기 · 색 · 들여쓰기** 위계가 약해서 구조가 한눈에 안 들어온다. 레퍼런스(매장관리/회원 관리 패턴) 대비 차이 큼.

#### 재현 경로
1. 로그인 → 모바일 뷰 또는 작은 창
2. 햄버거 아이콘 → 사이드 드로어 열림
3. 최하단 스크롤 → "내 저장공간 · 로그아웃" 이 한 줄에 공존

#### 귀속 커밋
- `17aecb1 feat(menu): 5개 카테고리 섹션 재분류 + 개발중 배지·비활성 정책 도입`
- `GaTenantDashboardMenuEntry` 에 `section` / `badge` 를 도입하면서 그룹핑 구조는 들어왔는데, 시각 위계(CSS) 와 "로그아웃은 항상 하단 고정" 규약이 함께 반영되지 않은 것으로 추정.

#### 원인 가설
- **구조**: 메뉴 빌더(`buildGaTenantDashboardMenu` · `buildAppMenuForSession`) 에서 로그아웃이 일반 엔트리로 `내정보` 섹션 안에 편입됨 → 섹션 단위 렌더 루프에 휩쓸려 나옴.
- **스타일**: section 헤더 전용 CSS 클래스는 생겼지만 (a) 헤더 ↔ 엔트리 간 폰트 사이즈 차이, (b) 엔트리 들여쓰기(padding-left), (c) section 사이 구분선/여백 등이 정립되지 않음.

#### 해결 방향 (근본)
1. **메뉴 빌더에서 로그아웃을 섹션 밖 "하단 고정 슬롯"** 으로 분리. 렌더 컴포넌트도 `sections[]` 와 `footerActions[]` 두 슬롯으로 받도록.
2. **section 헤더 전용 타이포 정립**: ~13px · uppercase · muted 컬러 · letter-spacing 미세 · 하위 섹션과 여백 16~20px.
3. **엔트리 타이포**: 15~16px base · `padding-left` 로 들여쓰기(예: 16px). 레퍼런스 "매장 관리 / 회원 관리" 스타일 차용.
4. 활성(`aria-current`) 엔트리는 좌측 강조 바 + 배경 hover 차이. badge(개발중 등) 는 엔트리 오른쪽 끝에 배치.

#### 영향 파일 (작업 시 뒤질 곳)
- `src/features/.../buildGaTenantDashboardMenu*.ts` (메뉴 빌더 · 정확한 경로는 grep)
- `src/features/.../buildAppMenuForSession*.ts`
- 사이드바 / 드로어 렌더 컴포넌트 (DashboardPage · 모바일 드로어 · PC 사이드바 3곳 공통 렌더 패턴 — `17aecb1` 커밋 메시지 참조)
- 관련 CSS (커밋 메시지에 "섹션 헤더, 항목 내 배지 관련 CSS 추가" 언급 있음 — 같은 파일에서 위계 보강)

#### 회귀 테스트 포인트
- [ ] 로그아웃이 드로어·PC 사이드바 모두에서 "항상 하단" 에 있다
- [ ] section 5개가 시각적으로 구분된다 (헤더/들여쓰기/여백)
- [ ] 개발중 badge 가 엔트리 우측 끝에 정렬된다
- [ ] 선택된(`aria-current`) 엔트리가 명확히 강조된다
- [ ] PC 사이드바 / 모바일 드로어 / 대시보드 카드 3곳 렌더가 일관된다

---

### §2.2 `/memo` 검은 화면 (이슈 #3 · **우선순위 상**)

#### 증상
- PC 또는 모바일에서 메모 진입 경로(PC 상시 `MemoPanel` · 모바일 `MemoMobileFab`) 로 `/memo` 에 들어가면 본문이 완전 검은 화면.
- 하단에 "추가" · "정리" 액션 버튼만 표시됨 → 레이아웃 컨테이너는 마운트되지만 리스트/콘텐츠 영역이 빈 노드.

#### 귀속 커밋
- `ddcd438 feat(mobile/memo): 메모 메뉴 제거 + 모바일 전용 FAB 도입`
- 커밋 설명에서 `buildAppMenuForSession` 의 `includeMemo` 옵션을 **세 호출처 모두에서 삭제** 했다고 함. 제거 과정에서 메모 페이지 본문 렌더 조건이 연관돼 있던 것으로 의심.

#### 원인 가설 (우선 점검 순)
1. **메모 페이지 컴포넌트의 디바이스 분기 로직이 비었다** — PC 분기에서 `MemoPanel` 을 띄우던 로직이 `includeMemo` 제거와 함께 "렌더하지 않음" 으로 떨어졌을 가능성.
2. **`/memo` 라우트 element 가 Outlet / layout 만 있고 본문이 빠짐** — 라우터 레벨에서 빈 Outlet 이 검은 배경을 그대로 노출.
3. **메모 스토어/쿼리 결과가 늦어 본문 placeholder 가 공백** — 스켈레톤이 빈 div 인 경우.
4. 다크 테마 배경이 `min-height: 100vh` 로 깔려있고 자식이 없을 때의 정상 외관일 가능성 (내용이 실제로 없는 것).

#### 해결 방향
1. `insurance-dev` (develop HEAD) 에서 재현 확인 → develop 에서도 100% 재현될 것.
2. `git log --follow -- src/features/memo/**` 또는 메모 관련 파일로 `ddcd438` 이 건드린 영역 정확히 식별.
3. 메모 페이지 **렌더 트리** 를 DevTools 로 확인: 본문 컴포넌트가 마운트되는지 / 데이터가 비어서 빈 상태인지 구분.
4. 원인에 따라:
   - 라우트 element 누락 → `appRouter.tsx` 에서 `/memo` element 복구
   - 디바이스 분기 회귀 → 분기 로직 정상화 + 유닛 레벨 테스트 추가
   - 데이터 빈 상태 처리 누락 → 빈 상태 EmptyState 컴포넌트 복구

#### 회귀 테스트 포인트
- [ ] PC 에서 MemoPanel 상시 노출 정상
- [ ] 모바일에서 FAB → `/memo` 진입 시 메모 리스트 렌더
- [ ] `/memo` 경로에서 FAB 이 자기 자신을 숨긴다 (`ddcd438` 에 명시된 스펙)
- [ ] 메모 생성 · 삭제 · 정리 플로우 정상

---

### §2.3 모바일 모달 하드웨어 뒤로가기 후 버튼 색상 회귀 (이슈 #4)

#### 증상
- 모바일 카드 내부 액션 버튼: **고객 파일 / 상담 내역 / 자동차 신청서 / GA 데이터 보기**
- 해당 버튼 탭 → 모달 오픈 → **모달의 "닫기" 버튼** 으로 닫으면: 버튼 색상 기본값 복귀 (정상)
- 같은 모달을 **하드웨어 / 브라우저 뒤로가기** 로 닫으면: 카드 내부 액션 4개 버튼이 **파란색 활성 상태** 로 남음

#### 귀속 커밋
- **미확정**. 두 경로(X 버튼 dismiss · 하드웨어 back dismiss) 중 한쪽만 증상이 나오므로 dismiss 시 cleanup 을 거치는 경로가 양분되어 있다고 보는 것이 가장 자연스럽다.
- `insurance-dev` (develop HEAD · 내 브랜치 없음) 에서 재현하면 **원인 커밋의 위치가 선행 develop 인지 훨씬 과거인지** 가 즉시 갈린다.

#### 원인 가설
1. **CSS 레벨**: 버튼이 `:active` / `:focus-visible` / `.is-pressed` 상태로 고정되고, 모달 open 시 blur 가 일어나지 않은 채 모달이 히스토리 push 로 열려 포커스가 보존됨. 하드웨어 back 으로 돌아올 때 포커스 · active 상태가 그대로 남음.
2. **JS 레벨**: 모달 open/close 시 버튼의 "pressed" / "selected" 클래스를 수동 토글하는 로직이 있는데, close 경로 중 X 버튼은 cleanup 을 돌고 하드웨어 back 경로(router blocker · popstate) 는 cleanup 을 건너뜀.
3. **AppExitConfirm / blocker 레이어 상호작용**: POP blocking 경로에서 모달 dismiss 시 state 반영이 유실.

#### 해결 방향 (근본)
1. **공통 close 훅**으로 수렴: `useModalDismiss(onClose)` 같은 얇은 훅이 X 버튼 · 백드롭 · 하드웨어 back · esc 모두에서 **동일 cleanup** 을 보장.
2. 버튼 상태는 **모달 열림 state 에서 파생**되도록 (버튼에 수동 클래스 토글 금지). `isOpen={activeMobileModal === 'files'}` 같이 파생값으로 `data-active` 를 주면 state 원복 즉시 시각도 원복.
3. CSS 보조 방어: `:focus-visible` 만 활성 시각을 주고, 클릭 직후 `document.activeElement` 를 blur 처리.

#### 회귀 테스트 포인트
- [ ] X 버튼 / 백드롭 / 하드웨어 back / esc 네 경로 모두에서 카드 액션 버튼 색상 기본값 복귀
- [ ] 같은 카드에서 모달 열고 닫기 반복해도 누적 상태 없음
- [ ] `insurance-dev` (develop HEAD) 에서 재현 여부를 먼저 찍어 귀속 커밋 확정

---

## 3. 작업 착수 순서 (기존 채팅방용 치트시트)

### 준비
```powershell
# 이미 develop HEAD 가 체크아웃되어 있는 worktree
cd D:\workspace\insurance-dev
git fetch origin
git status      # clean 인지 먼저 확인
```

### 브랜치 3개 각각
```powershell
# 이슈 #3 (우선) — 서비스 영향 큼
git checkout -b fix/memo-page-blank-on-entry develop

# 작업 → 로컬 검증(npm run dev) → 커밋 → push → PR(base: develop)

# 이슈 #1 + #2
git checkout develop && git pull --ff-only origin develop
git checkout -b fix/sidebar-logout-position-and-hierarchy develop

# 이슈 #4
git checkout develop && git pull --ff-only origin develop
git checkout -b fix/mobile-modal-hw-back-button-state develop
```

### 공통 규약
- 각 PR 은 하나의 이슈만 다룬다. #1·#2 는 "메뉴 위계" 라는 단일 축으로 묶여 같은 브랜치 허용.
- merge 는 사용자 승인 후에만. develop · main 직접 푸시 금지.
- 회귀 테스트는 각 §2.x 의 체크리스트를 그대로 사용.

---

## 4. 모체 PR 과의 관계

- 본 문서는 `refactor(customers): routing SSOT 근본 정리` PR 에 **문서로만** 동봉된다.
  (실제 UI 수정은 이 PR 에 포함되지 않음.)
- 모체 PR 이 merge 된 뒤 위 3개 후속 PR 을 순차 진행하면 자연스럽다.
- 본 문서와 `docs/refactor-plans/customers-routing-ssot.md` 는 세트로 참조하라.
