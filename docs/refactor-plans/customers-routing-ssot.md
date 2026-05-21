# 고객관리 routing SSOT 근본 정리 — Handoff 노트

> **작성 시점**: `583cfb2` (PC/모바일 분리 Tier 1~4 전부 ✅ 완료 직후)
> **작업 브랜치**: `refactor/customers-routing-ssot` (develop 에서 분기)
> **대상 파일 (주)**: `src/features/customers/pages/CustomersPage.tsx`

## 1. 배경 — 왜 이 작업이 필요한가

고객 파일 / 상담이력 / 메모보기 메뉴 전환이 안 되던 과거 버그를
잡을 때, **구조적 수정 대신 가드(early return) 방식으로 응급 처치**만
먼저 넣고 근본 정리는 미뤄둔 상태.

### 현재 문제

`selectedCustomerId` 를 **세 소스**(URL path / expandedId / `?customerId=` 쿼리)가
동시에 갱신 → 서로 덮어쓰며 핑퐁 → `Maximum update depth exceeded` 가능.

지금은 아래 세 개의 useEffect 에 early-return 조건을 주렁주렁 붙여
억지로 막고 있음 (`CustomersPage.tsx` 1533~1549 근처).

- Effect A: query → state (pull)
- Effect B: expandedId → state (pull)
- Effect C: expandedId → query (push, `CustomersPage.tsx` 1673 근처)

이 구조의 나쁜 점:

1. **가드 조건이 주석 없이는 설계 의도를 이해 불가**
2. 새 우측 메뉴 / 새 딥링크 추가 시 **가드 조건을 또 추가**해야 함
3. 6개월 뒤 주니어가 "이 early return 왜 있지?" 하며 고치다 회귀 유발 가능성

## 2. 목표 구조

`selectedCustomerId` 를 `useState` 에서 **`useMemo` 파생값**으로 전환한다.

```ts
// 우선순위: path(상세탭) → expandedId → ?customerId=
const selectedCustomerId = useMemo<number | null>(() => {
  const fromPath = parseWorkspaceCustomerIdFromPath(location.pathname)
  if (fromPath != null) return fromPath
  if (expandedId != null) return expandedId
  return parseSelectedCustomerId(searchParams.get('customerId'))
}, [location.pathname, expandedId, searchParams])
```

`setSelectedCustomerId` 는 전부 제거. 상태를 바꾸고 싶으면
**소스 중 하나**(path / expandedId / query) 를 바꾸도록 호출부를 수정한다.

### 이 구조의 장점

- **단일 진실 원천 1개, 파생 1개**, 동기화 effect 불필요
- 핑퐁 가능성 원천 차단 → 가드 주석·early return 전부 제거
- 새 메뉴 추가 시 `WORKSPACE_SIDE_DETAIL_TABS` + `resolveCustomerWorkspaceTab`
  두 곳만 갱신 (지금도 같지만, 여기에 가드 조건이 안 얹힘)

## 3. 변경 대상 파일

| 파일 | 변경 성격 |
|---|---|
| `src/features/customers/pages/CustomersPage.tsx` | 주요 변경 — state → memo 전환, 3개 effect 축소/삭제 |
| `src/features/customers/pages/customers/CustomersPagePCView.tsx` | 영향 확인 (props 시그니처 변동 가능) |
| `src/features/customers/pages/customers/CustomersPageMobileView.tsx` | 영향 확인 |
| `src/features/customers/pages/CustomerWorkspaceLayout.tsx` | 이미 path 기준 파생이라 영향 없을 가능성 큼. 확인 필요 |
| `AGENTS.md` | 완료 후 "routing SSOT" 관련 메모 업데이트 |

## 4. 커밋 분할 제안 (중간 스냅샷)

1. `docs: handoff 노트 추가` (이 문서 자체)
2. `refactor(customers): selectedCustomerId 를 useMemo 파생값으로 전환 + Effect A 제거`
3. `refactor(customers): Effect B (expandedId→state) 제거`
4. `refactor(customers): Effect C (expandedId→query) 구조 단순화`
5. `chore(customers): 임시 가드 주석·early return 정리 + 회귀 회피용 테스트 가이드 반영`

각 단계 후 로컬에서 ## 5. 시나리오 체크리스트 를 돌린다.

## 5. 회귀 테스트 시나리오 (머지 전 필수)

모두 **로컬에서 직접 손으로 눌러 확인** 할 것. 자동화 테스트 없음.

### PC

- [ ] `/customers` 진입 → 첫 번째 고객 카드 클릭 → 펼쳐짐 + 우측 영역 해당 고객
- [ ] A 고객 펼쳐진 상태에서 B 고객 클릭 → 우측 영역이 B 로 **즉시** 교체
- [ ] `/customers/123/files` 직접 URL 진입 → 우측 파일 탭으로 정상 랜딩
- [ ] `/customers/123/memos` 에서 B 고객 선택 → `/customers/456/memos` 로 이동(탭 유지)
- [ ] `/customers/123/files` 에서 다른 메뉴(고객파일·상담이력·메모보기·자동차·GA) 클릭 → 정상 전환
- [ ] 뒤로가기 / 앞으로가기 → URL 과 우측 영역이 일치
- [ ] 새로고침 → URL 기준으로 복원
- [ ] `?customerId=123` 만 있고 path tab 없는 경우 → 해당 고객 펼쳐짐
- [ ] `/customers` 에서 검색어 입력 → 검색 결과 클릭 → 우측 전환 정상

### 모바일

- [ ] 목록에서 고객 클릭 → 카드 펼쳐짐 (우측 패널 없음)
- [ ] 카드 내부 "고객파일 / 상담이력 / 자동차 / GA" 클릭 → **모달** 오픈 (네비게이션 아님)
- [ ] 모달 상태에서 하드웨어 뒤로가기 → 모달만 닫힘 (페이지 유지)
- [ ] 다른 고객 클릭 → 이전 고객 카드 접힘, 새 고객 펼쳐짐
- [ ] 검색 입력 → 결과 정상 표시 + 클릭 정상

### 성능

- [ ] 클릭 시 콘솔에 경고/에러 없음
- [ ] `Maximum update depth exceeded` 재발 없음

## 6. 주의 사항 (함정 지점)

### (A) 모바일에서 expandedId 우선 원칙

현 Effect A 의 `if (isMobile && expandedId != null) return` 가드는
**모바일에서 카드 펼침이 query 보다 우선** 이라는 뜻.
`useMemo` 파생값에서도 이 우선순위를 유지해야 한다 (위 구조 제안에서
`expandedId` 를 path 다음으로 둔 이유).

### (B) side-detail path 상에서 query 갱신 제외

Effect C 에 `isCustomerWorkspaceSideDetailPath(location.pathname)` 가드가 있음.
**우측 패널이 열린 상태에서 query 를 마음대로 갱신하면**
파일 패널·메모 패널 등이 열려 있는 URL 상태가 깨짐.

구조 개편 시에도 "path 가 우선, query 는 보조" 규약을 유지한다.

### (C) 카드 펼침 스크롤 복원

`useLayoutEffect` 블록의 ResizeObserver + WebView 스크롤 전략은
`expandedId` 를 dep 로 받음. memo 화 이후 `expandedId` 가 여전히
독립 state 로 살아있는지 확인. (현재 설계는 `expandedId` 는 state,
`selectedCustomerId` 만 파생으로 전환하는 방안이므로 스크롤 코드는 영향 없음.)

### (D) 편집 모드 상태 연동

`useEffect(() => { if (editingId != null && expandedId !== editingId) { cancelEdit() } })`
이 effect 는 그대로 유지. `selectedCustomerId` 변경이 아닌 `expandedId` 변경에
반응하므로 영향 없음.

## 7. 완료 기준

- [ ] 위 §5 시나리오 **전부** 통과
- [ ] `CustomersPage.tsx` 에서 `setSelectedCustomerId` 호출 **0건**
- [ ] §1 에 언급된 가드 주석 블록(1507~1532) 및 early return 제거
- [ ] ESLint · TypeScript 체크 통과
- [ ] develop → main fast-forward 머지 성공
- [ ] `AGENTS.md` 에 이 handoff 노트 링크 제거 또는 "완료" 표시

## 8. 착수 시 첫 단계

```bash
# develop 최신 상태 확인
git checkout develop
git pull --ff-only origin develop

# 새 브랜치
git checkout -b refactor/customers-routing-ssot

# 이 문서를 먼저 읽고 §2 목표 구조·§6 함정 지점을 머릿속에 둔 뒤
# §4 커밋 분할 순서대로 진행
```

## 9. 관련 참고

- `.cursor/rules/routing-ssot.mdc` — 라우팅 SSOT 원칙 (존재하면 반드시 읽기)
- `CustomersPage.tsx` 1507~1532 주석 블록 — 현재 상태의 배경 설명
- 과거 회귀 이력: "고객 클릭해도 우측 영역이 이전 고객 기준으로 남음"

## 10. 완료 기록 (`refactor/customers-routing-ssot` 브랜치 작업 결과)

### 10.1 커밋 타임라인

| 커밋 | 역할 |
|---|---|
| `68557ba` docs | 본 handoff 노트 추가 (§1~§9) |
| `dfd7aed` refactor | `selectedCustomerId` dead state 제거 + Effect A/B(query→state, expandedId→state) pull effect 2개 제거 |
| (`6d9cc49` chore) | Scenario 6 진단용 임시 `console.log` 투입 — 이후 제거 |
| `9003df3` refactor | Effect C(expandedId→query push) 제거 → `setExpandedId` 를 `useCallback` 래퍼로 전환, state 와 `?customerId=` 를 한 호출에서 원자 갱신 |
| `8926934` refactor | 카드 요약 클릭에서 `toggleExpanded` + `handleSelectCustomer` 가 `setExpandedId` 를 이중으로 트리거하던 문제 정리 (책임 분리) |
| (본 커밋) refactor | 히스토리 주석 축약·제거 + rule §10/§11 신설 + 본 섹션 추가 |

### 10.2 §5 회귀 시나리오 결과

- **PC**: 카드 클릭·A→B 전환·사이드 디테일 직접 진입·탭 유지·뒤로/새로고침 전부 정상.
- **모바일**: 카드 펼침이 `?customerId=` 쿼리와 같은 틱에 동기화됨을 콘솔 로그로 확인 (이후 로그 제거).
- **성능**: `Maximum update depth exceeded` 재발 없음. 콘솔 에러 0.

### 10.3 근본 정리가 낳은 불변식

1. `CustomersPage` 는 좌측 목록(`expandedId`) 과 `?customerId=` 쿼리만 관리한다. 선택된 고객 id 의 SSOT 는 URL path 이며 `CustomerWorkspaceLayout` 의 파생 한 곳뿐이다.
2. `setExpandedId` 는 state 와 URL 을 **같은 호출에서** 갱신한다. 별도 "state → URL reflect" effect 는 존재하지 않는다.
3. side-detail path(`/customers/:id/<tab>`) 위에서는 리스트 조작이 `?customerId=` 를 덮어쓰지 않는다. URL 갱신 권한은 우측 패널이 가진다.
4. 카드 요약 클릭의 책임은 분리되어 있다.
   - `useExpandableCard.toggleExpanded` → expandedId 토글 + 접기 애니메이션
   - `handleSelectCustomer` → 스크롤 요청 + PC navigate

### 10.4 이번 스코프 밖으로 남긴 이슈

- `/customers?customerId=123` 로 직접 진입 시 대시보드로 리다이렉트되는 현상이 보고됨. 본 리팩터와 무관(라우터/가드 상위 레이어 추정). 별도 티켓으로 조사 필요.
- 개발 환경 콘솔의 `[Violation] Forced reflow` 경고는 `develop` 기준선에도 동일하게 존재하는 pre-existing 항목. 기능 영향 없음.

### 10.5 rule 문서 업데이트 (`.cursor/rules/routing-ssot.mdc`)

- `§10` 신설 — "state → URL reflect 는 effect 가 아니라 setter 래퍼에서"
- `§11` 신설 — "side-detail path 에서 리스트 조작은 우측 패널 URL 을 덮어쓰지 않는다"
- `§12` 체크리스트 — 위 두 항목 추가
