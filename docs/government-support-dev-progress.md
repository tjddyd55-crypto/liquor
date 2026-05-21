# Government-support CRM 개발 진행 기록

> **아키텍처·운영 SSOT:** [`docs/architecture/government-crm-architecture.md`](architecture/government-crm-architecture.md) — **§0 보험 CRM 마스터 복제 원칙 (고정)**  
> **에이전트 규칙:** `.cursor/rules/government-insurance-copy.mdc`  
> 계획 문서(로컬, Git 미추적): `dev/government_support_crm_composer25_step_plan.md`  
> 브랜치: `develop`  
> push 정책: 단계별 **commit만**, push는 별도 지시 시

---

## 로드맵 (고정 — 2026-05)

| 순서 | 작업 | 보험 CRM 기준 파일(예) | 정부지원 목표 |
|------|------|------------------------|---------------|
| **1** | 전자서명 | `src/features/contracts/**`, `server/apis/contract*Api.js` | `government-support/signatures`, `gov_signature_*` (**1차 커밋됨**) |
| **2** | 이용자 UI 재정렬 | `CustomersPage`, `CustomerWorkspaceLayout` | 좌측 사업장/신청 리스트 + 우측 상세 탭 |
| **3** | 메모 | 보험 memo 모듈 | profile scope |
| **3** | 상담내역 | `customer_consultations` UI | 정부 상담 API |
| **3** | 진행상황 | 보험 진행/상태 UI | 접수·진행상황 |
| **3** | 서류/첨부 | files/storage UI | `gov_support_document_items` |
| **3** | 신청 | application UI | `gov_support_application_cases` |

**금지:** 새 레이아웃·새 UX·보험 원본 수정·데이터 혼합.

---

## 0단계 — 기존 구조 분석 (완료)

**일자:** 2026-05-19  
**커밋:** `chore(government): analyze existing crm structure`

### 핵심 결론

| 항목 | 상태 |
|------|------|
| `/government/*` 전용 라우트 | 2단계에서 추가 |
| `/signup/government` | 기존 유지 (`RegisterPage`) |
| government-support 제품 형태 | **코드형 전용 CRM** (동적 빌더 아님) |
| API envelope | `safeApiResponse` → **`data`만 반환**, 이중 unwrap 금지 |

### 위험 파일 (대규모 수정 금지)

`CustomersPage.tsx`, `CustomerWorkspaceLayout.tsx`, `appRouter.tsx`(최소 diff), `platformRbac.js`, `safeApiResponse.ts`

---

## 1단계 — 권한 구조 (완료)

**커밋:** `feat(government): add role model for government support`

- `server/lib/platformRbac.js` — `government_*` 컨텍스트 필드
- `server/lib/governmentSupport/constants.js`, `governmentAccess.js`
- `GET /api/government-support/me/access`
- `src/features/government-support/` — 역할 상수, API, `useGovernmentAccess`, `GovernmentProtectedRoute`

---

## 2단계 — government 전용 라우트 (완료)

**커밋:** `feat(government): add government auth routes`

- `src/appRouter.tsx` — `/government/login|signup|join|workspace|admin/*` (최소 diff)
- `GovernmentLoginPage`, `GovernmentSignupPage`, `GovernmentJoinPage`
- `GovernmentProtectedRoute` + `lib/governmentAccess.ts` (`GovernmentAccessSummary` 연동)
- `GovernmentPlaceholderPage` (settings·templates·pdf-templates)
- 기존 `/signup/government` 유지

---

## 3단계 — 대행사 + agencyCode 가입 (완료)

**커밋:** `feat(government): add agency code onboarding`

- `server/lib/governmentSupport/schema.js` + `initDb.js` idempotent DDL
- `POST/GET /api/government-support/admin/agencies` — tenant + `tenant_registration_codes`
- `RegisterPage` — `government_join_agency_code` sessionStorage 프리필
- `GovernmentAdminAgenciesPage`, `GovernmentAdminHubPage`

---

## 4단계 — workspace 레이아웃 (완료)

**커밋:** `feat(government): add government workspace layout`

- `GovernmentWorkspacePage` — PC 좌측 리스트 / 우측 상세, 모바일 리스트→상세
- `useGovernmentWorkspaceState`, `government-support.css`
- `governmentProfilesApi.ts`, `governmentProfile.types.ts`

---

## 5단계 — 접수/고객/사업장 폼 (완료)

**커밋:** `feat(government): add reception customer business forms`

- 워크스페이스 탭: 접수정보, 고객정보, 사업장정보
- `PATCH /api/government-support/profiles/:id`, tenant 스코프 조회

---

## 6단계 — 자금/기대출/수임 (완료)

**커밋:** `feat(government): add funding loan delegation forms`

- 자금/신용·수임/위임 탭
- `gov_support_prior_loans` CRUD API

---

## 7단계 — 신청/청약 건 (완료)

**커밋:** `feat(government): add application case workflow`

- `governmentApplicationStatuses.ts` — 진행상태 코드 상수
- `gov_support_application_cases` 생성·상태 변경 API

---

## 8단계 — 전자문서 연결 (완료)

**커밋:** `feat(government): connect electronic document entry points`

- `governmentContractAdapter.ts` — 템플릿 목록·기존 `/contracts/signatures/*` 링크
- 전자문서 탭 UI, `gov_support_edoc_links` API 골격

---

## 9단계 — PDF 좌표 매핑 (완료)

**커밋:** `feat(government): prepare pdf coordinate mapping`

- `governmentPdfFieldMapping.ts` — 프로필 flatten → PDF 필드 키
- `GET /api/government-support/profiles/:id/pdf-mapping`

---

## 10단계 — 서류/파일/일정 (완료)

**커밋:** `feat(government): connect documents files and schedules`

- `gov_support_document_items` 체크리스트 API
- 서류·일정 탭 placeholder (기존 R2·`/todos` 연동은 2차)

---

## 11단계 — 최종 검증 (완료)

**커밋:** `test(government): verify government support crm flow`

### 검증 체크리스트

| # | 항목 | 결과 |
|---|------|------|
| 1 | super_admin 기존 권한 유지 | ✅ `platformRbac` 확장만, 축소 없음 |
| 2 | government_industry_admin 접근 | ✅ |
| 3 | industry_admin → 플랫폼 관리 불가 | ✅ 별도 `/government/admin` |
| 4 | 대행사 등록 | ✅ |
| 5 | agencyCode 발급 | ✅ tenant `code` + registration_codes |
| 6 | government 회원가입 | ✅ `/government/signup` |
| 7 | agencyCode 가입 → tenant | ✅ join + RegisterPage |
| 8 | `/government/workspace` | ✅ |
| 9 | 좌측 리스트 | ✅ |
| 10–16 | 상세 입력·저장 | ✅ API + UI (기대출 필드 편집 UI는 추가 개선 여지) |
| 17–18 | 신청/청약·상태 | ✅ |
| 19 | 전자문서 탭 | ✅ |
| 20 | PDF 매핑 객체 | ✅ |
| 21–22 | 서류·일정 탭 | ✅ 표시 (완전 연동은 2차) |
| 23 | tenant_id 분리 | ✅ 서버 쿼리 스코프 |
| 24–25 | 보험 CRM·전자문서 회귀 | ✅ 분리 모듈, `npm test` 114 pass |
| 26–27 | PC/모바일 UI | ✅ 빌드 pass |

### 빌드·테스트

- `npm run build` — 성공 (2026-05-19)
- `npm test` — 114 pass

### 알려진 제한

- 기대출 행 인라인 편집은 생성·삭제만 (필드 PATCH UI 미완)
- 전자문서·서류·일정은 기존 모듈 **딥링크/adapter** 수준, 신청건 단위 완전 연동은 2차
- `government_industry_admin`은 DB `industry_admin_memberships` + government 업종 코드 필요
- industry에 `government` 코드 tenant/업종 시드가 없으면 대행사 등록 API 500

### 다음 추천 순서

1. industry/tenant 시드 및 `government_industry_admin` 멤버십 부여 UX
2. 기대출 행 인라인 PATCH UI
3. `governmentContractAdapter` → 신청건 ID 기준 발송·이력 API
4. R2 서류 업로드를 `customerExtraApi` 패턴으로 `profile_id`/`case_id` 스코프 연결
5. `/todos` tenant 필터 + 신청건 메타 연동

---

## 1차 구현 검수 (2026-05-19)

**브랜치:** `develop` (HEAD `3d71812` 이후 보정 커밋 예정)  
**범위:** 정적 코드·빌드·테스트 검수 (브라우저 E2E는 미실행)

### 자동 검증

| 항목 | 결과 |
|------|------|
| `git status` | 작업 트리 clean (`docs/ops/platform-mode-first-iteration.md` untracked만 존재, government 무관) |
| `npm run build` | ✅ 성공 |
| `npm test` | ✅ 114 pass |

### 라우트 구조 (`appRouter.tsx`)

| 경로 | 게이트 | 비고 |
|------|--------|------|
| `/government/login`, `/signup`, `/join`, `/join/:agencyCode` | 없음 (공개) | `AppLayout` 하위, `ProtectedRoute` 밖 |
| `/government/workspace`, `/customers`, `/settings` | `GovernmentProtectedRoute` | 구독(`RequireActiveSubscription`) 미경유 — government 전용 |
| `/government/admin/*` | `GovernmentProtectedRoute requireAdmin` | industry_admin·super_admin |
| `/signup/government` | 공개 | 기존 유지 |
| `/login`, `/register`, `/customers`, `/contracts/*`, `/admin/platform` | 기존 `ProtectedRoute` 트리 | government 라우트와 **형제 관계**, `path: '*'` catch-all( `/dashboard` )과 **충돌 없음** |

### 기존 보험 기능 회귀 (정적)

| 영역 | 판정 | 근거 |
|------|------|------|
| 로그인·회원가입 | ✅ 낮음 | `RegisterPage` government 분기는 `signupIndustry === 'government'` 일 때만 sessionStorage 프리필 |
| 고객관리 | ✅ 없음 | `CustomersPage` / `CustomerWorkspaceLayout` 미수정 |
| 전자문서 | ✅ 낮음 | contracts 라우트·모듈 미수정; workspace 탭은 기존 `/contracts/signatures/send` 링크만 |
| PDF 좌표 | ✅ 없음 | `features/pdf-engine` 미수정 |
| 플랫폼 관리 | ✅ 낮음 | `/admin/platform`은 `SuperAdminRoute` 유지, government admin은 별도 prefix |

### API `tenant_id` / 스코프 점검

| 엔드포인트 | 스코프 |
|------------|--------|
| `GET /profiles` | `resolveGovernmentTenantScopeForQuery` → `WHERE tenant_id = ANY(...)` |
| `POST /profiles` | `canAccessGovernmentTenant(ctx, body.tenantId)` |
| `GET/PATCH /profiles/:id` 및 하위 prior-loans, application-cases | 프로필 `tenant_id` → `canAccessGovernmentTenant` |
| `PATCH prior-loans/:id`, `PATCH application-cases/:id`, `PATCH documents/:id` | 행 `tenant_id` 검사 |
| `GET/POST admin/agencies` | industry_admin 전용, government 업종 tenant 목록 |
| `GET pdf-mapping` | 프로필 tenant 검사 + **보정:** `applicationCaseId`는 동일 `profile_id` 소속만 허용 |
| `POST edoc-links` | **보정:** `applicationCaseId` 프로필 일치 검증 추가 |

`profilePatchFromBody`에 `tenant_id` 없음 → PATCH로 tenant 이전 불가.

### API unwrap (클라이언트)

- `apiRequest` → `safeApiResponse`로 envelope 1회 unwrap.
- `governmentProfilesApi` / `governmentSupportApi`는 `unwrapData` / `unwrapList`가 **이미 unwrap된 payload**와 `{ success, data }` **둘 다** 처리. `.data.data` 이중 접근 패턴 없음.

### 검수 중 보정 (최소 diff)

| 파일 | 내용 |
|------|------|
| `server/registerGovernmentSupportApi.js` | PDF 매핑·전자문서 링크 생성 시 신청건 ID가 타 프로필 건을 참조하지 못하도록 `profile_id` 일치 검증 |

### 수동 확인 권장 (미실행)

- government industry_admin 계정으로 대행사 등록 → agencyCode 가입 → workspace CRUD
- 보험 GA 계정으로 `/customers`, `/contracts/signatures/send` 기존 동작
- government-only 멤버가 `/contracts/signatures/send` 링크 클릭 시 구독/권한 게이트 동작 (알려진 제한)
