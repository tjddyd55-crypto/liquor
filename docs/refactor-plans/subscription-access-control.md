# 구독 상태 기반 접근 제어 시스템 — 설계/구현 계획

> 상태: **PR1 ~ PR6 전부 완료 (develop + main 머지)**. 구독 상태 기반 접근 제어 시스템의 데이터 모델 · 정책 · 서버 가드 · 프론트 가드 · 내 정보 관리 UI · 관리자 일괄 관리 UI · 정책 단위 테스트까지 배포 완료. 기본 상태는 `policy_active=false` 로, 관리자가 구독 정책 페이지에서 "정책 활성화" 를 누르기 전까지는 전 유저가 실질적으로 FREE 상태로 서비스를 이용한다.
> 범위: FREE / TRIAL / PAID / EXPIRED 4단계 상태 모델을 도입하고,
> 서버·프론트 동일 정책으로 접근 제어한다. 실제 PG 결제 연동은 스코프 밖.
>
> **용어**: 정책 집행 스위치의 단일 키 이름은 `subscription.policy_active` (app_settings). 정책 함수 인자명은 `policyActive`. 문서 곳곳에서 이 이름으로만 언급한다.

---

## 0. 확정 필요한 의사결정 5개

| # | 항목 | 권장안 | 대안 |
|---|------|--------|------|
| D1 | **구독 대상 역할** | `USER`, `GA_ADMIN`, `GA_STAFF` 만 구독 대상. `SUPER_ADMIN` 은 항상 FREE, `INSURER_MANAGER` / `LOSS_ADJUSTER` 는 이번 스코프 제외(별도 계정 체계). | 담당자도 포함 |
| D2 | **전 유저 기본값 + 활성화 방식** | **확정(구현 완료)**: 배포 시점 기본 `plan='FREE'` + `policy_active=false`. 이 상태에서는 정책 함수가 전원 `ACTIVE` 로 단락하므로 아무도 차단되지 않는다. 관리자가 `POST /api/admin/subscription/activate` 를 호출하는 순간 동일 트랜잭션 안에서 (a) 구독 주체 FREE 유저를 TRIAL 로 일괄 전환하며 `started_at=NOW()` / `expires_at=NOW()+trialDays` 로 타이머 시작, (b) `subscription_change_logs` 에 `reason='policy-activation'` 로 감사 기록, (c) `policy_active=true` 로 플래그 토글. 두 번째 호출은 이미 시작된 타이머를 덮어쓰지 않음(멱등). 비활성화는 플래그만 false 로 되돌리고 타이머는 보존(재활성화 시 이어서 감소). | 배포 즉시 타이머 시작(리스크 큼 — 채택 안 함) |
| D3 | **구독 단위** | **유저별**. "GA 전체 일괄 30일 TRIAL" 같은 운영 요구는 관리자 **일괄 작업 기능**으로 커버. | GA 단위 구독 + 유저별 오버라이드 (복잡) |
| D4 | **관리자 UI** | 기존 `/admin/users`(`UserManagementPage`) 를 확장(플랜 컬럼·필터·일괄작업). | 신규 `/admin/subscriptions` 페이지 분리 |
| D5 | **PR 분할 & 머지 순서** | 아래 §4 의 6단계 PR. 각 PR 은 develop → main 순차 머지, 사용자 테스트 후 다음 PR. | 한 번에 big bang |

---

## 1. 현상 파악 (Why it matters)

탐색 결과 요약(출처: 탐색 에이전트 보고서, 2026-04-16 기준):

### 1-1. users 테이블
- `CREATE TABLE users`: `id / username / password_hash / created_at`
- 순차 `ALTER TABLE` 로 `role / display_name / ga_id / status / is_deleted / phone / team_id / storage_limit / storage_used` 추가
- `role` 정규화값: `SUPER_ADMIN | GA_ADMIN | GA_STAFF | USER | INSURER_MANAGER | LOSS_ADJUSTER`
- `status` CHECK: `active | blocked | inactive | reset` — **구독 상태가 아님** (계정 정지 상태)
- **구독/결제 관련 컬럼 전무**

### 1-2. 마이그레이션 패턴
- 별도 마이그레이션 도구 없음. `server/initDb.js` 가 idempotent 스크립트로 매 기동 수행.
- 관례: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, CHECK 제약은 `DROP ... IF EXISTS` 후 `ADD`, 인덱스는 `CREATE INDEX IF NOT EXISTS`.

### 1-3. 인증·인가
- `server/index.js` 에 `requireAuth` 존재. `req.user = { id, username, role, gaId, gaCode, gaName, companyId, displayName, teamId }`
- 로그인: `POST /api/auth/login` → `{ token, user }` (snake_case) → 프론트 `authApi.login()` 에서 camelCase 정규화
- 프로필: `GET /api/me` (`USER` 만 `requireProfileUser` 통과)
- 403 표준 응답: `forbiddenResponse(req, res, message)` → `{ error: 'FORBIDDEN', message }`
- **토큰 refresh 엔드포인트 없음.** 만료되면 요청 시 401.

### 1-4. 프론트 가드
- `ProtectedRoute`: 로그인 필수
- `SuperAdminRoute` / `StaffRoute` / `RequireNotInsurerManagerRoute` / `InsurerManagerOnlyRoute` / `GaCarInsuranceRoute` / `AuditLogReaderRoute`
- 공용 헬퍼: `src/features/auth/roleGuards.ts`

### 1-5. 라우트 / 메뉴
- `appRouter.tsx` 는 공개 → `ProtectedRoute` → `AppWorkspaceLayout` → (역할 가드) → 페이지 순으로 중첩
- 대시보드 메뉴 SSOT: `src/features/dashboard/gaTenantMenu.ts`
  - `buildGaTenantDashboardMenu` 가 일반 유저용 메뉴
  - `buildAppMenuForSession(role, …)` 가 역할별 메뉴 병합
- "내 정보 관리" = `/profile` (`ProfilePage`) — **이 한 경로가 EXPIRED 허용의 중심**
- "문의·요청" = `/feature-request` (`FeatureRequestPage`) — EXPIRED 허용 대상
- "내 저장공간" = `/storage` (`MyStoragePage`) — 업로드 기능 포함 → **EXPIRED 차단 대상**

### 1-6. 관리자 페이지
- 이미 `/admin/users` (`UserManagementPage`) 존재 → 여기에 플랜 컬럼/필터/일괄작업 확장이 자연스러움
- 관리자 라우트 프리픽스는 `/admin/...` 과 `/internal/admin/...` 혼재(기존 관례 유지)

---

## 2. 정책 SSOT 설계

### 2-1. 상태 모델

```
plan ∈ { FREE, TRIAL, PAID, EXPIRED }
expires_at ∈ TIMESTAMPTZ | NULL
started_at ∈ TIMESTAMPTZ | NULL
```

**원칙**: DB 의 `plan` 은 **"의도한 상태"** 고, **"실제 유효 상태"** 는 서버가 계산한다.

- `plan='FREE'`                                         → effective: `FREE`
- `plan='TRIAL' | 'PAID'` AND `expires_at > NOW()`      → effective: `TRIAL | PAID` (활성)
- `plan='TRIAL' | 'PAID'` AND `expires_at <= NOW()`     → effective: `EXPIRED`
- `plan='EXPIRED'` (관리자 강제)                         → effective: `EXPIRED`

=> cron 불필요. **매 요청 시 `evaluateSubscription()` 으로 판정**. DB 의 `plan` 을 뒤늦게 `EXPIRED` 로 업데이트하는 동기화는 선택(로그인 성공 시 lazy update).

### 2-2. 역할별 기본 정책

| role | 구독 대상 | 기본 plan | 만료 적용 |
|------|----------|-----------|-----------|
| `SUPER_ADMIN` | ❌ | (N/A) | 항상 통과 |
| `GA_ADMIN` / `GA_STAFF` / `USER` | ✅ | `FREE` | effective=EXPIRED 이면 차단 |
| `INSURER_MANAGER` / `LOSS_ADJUSTER` | ❌ (이번 스코프) | (N/A) | 항상 통과 (기존 로직 유지) |

### 2-3. 공용 정책 함수 (서버 = 프론트 시그니처 동일)

구현: `server/subscription/policy.js` (서버) / `src/features/subscription/policy.ts` (프론트 미러).

```
evaluateSubscription(input: {
  role: string | null
  plan: 'FREE'|'TRIAL'|'PAID'|'EXPIRED'|null
  expiresAt: Date|string|null
  startedAt: Date|string|null
  policyActive: boolean          // app_settings.'subscription.policy_active'
  now?: Date                     // 테스트 주입용
}): {
  effectiveStatus: 'ACTIVE'|'EXPIRED'
  plan: 'FREE'|'TRIAL'|'PAID'|'EXPIRED'
  expiresAt: Date|null
  startedAt: Date|null
  remainingDays: number|null     // policy-inactive / not-subject / free 는 null
  reason:
    | 'policy-inactive'          // 정책 스위치 OFF → 전원 단락 통과
    | 'not-subject'              // SUPER_ADMIN / 담당자 계정
    | 'free'
    | 'trial-active' | 'paid-active'
    | 'trial-expired' | 'paid-expired'
    | 'forced-expired'           // plan='EXPIRED' (관리자 강제)
}
```

**판정 순서** (위에서부터, 첫 매칭으로 결정):
1. `policyActive !== true` → `ACTIVE` / plan=FREE (`reason: 'policy-inactive'`)
2. `role` ∉ `SUBSCRIPTION_SUBJECT_ROLES`(=`['GA_ADMIN','GA_STAFF','USER']`) → `ACTIVE` / plan=FREE (`reason: 'not-subject'`)
3. `plan === 'FREE'` → `ACTIVE` (`reason: 'free'`)
4. `plan === 'EXPIRED'` → `EXPIRED` (`reason: 'forced-expired'`)
5. `plan === 'TRIAL'` 이고 `expiresAt > now` → `ACTIVE` · 아니면 `EXPIRED` (`trial-active` / `trial-expired`)
6. `plan === 'PAID'` 이고 `expiresAt > now` → `ACTIVE` · 아니면 `EXPIRED` (`paid-active` / `paid-expired`)

활성화 전 유저는 모두 plan=FREE 이므로 "started_at=NULL 상태의 TRIAL" 케이스는 존재하지 않는다(활성화 트랜잭션이 FREE→TRIAL 전환과 started_at 세팅을 원자적으로 수행).

### 2-4. EXPIRED 화이트리스트 (서버·프론트 공통 SSOT)

EXPIRED 유저가 접근 가능한 경로/API prefix **유일 정의**:

```
// src/features/subscription/policy.ts  (서버도 동일 파일에서 import 하거나, server/subscription/policy.js 미러)
EXPIRED_ALLOW_FRONTEND_PATHS = [
  '/profile',
  '/account/reset',
  '/feature-request',          // 문의·요청
  '/login',                    // 로그아웃 후 복귀
]

EXPIRED_ALLOW_API_PREFIXES = [
  '/api/auth/',                // 로그인/로그아웃
  '/api/me',                   // 프로필 조회
  '/api/profile',              // 프로필 수정
  '/api/account/',             // 비번 재설정 등
  '/api/subscription/',        // 구독 상태 조회·결제 연동 진입점(미래)
  '/api/feature-request',      // 문의 작성
  '/api/feature-requests/my',  // 내 문의 목록·삭제
]
```

**원칙**: 화이트리스트 방식. 신규 API/경로 추가 시 기본값은 차단 → 필요한 것만 명시적으로 허용.

---

## 3. 데이터 모델 변경

### 3-1. users 컬럼 추가 (마이그레이션 = initDb 확장)

```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS
  subscription_plan TEXT NOT NULL DEFAULT 'FREE';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_subscription_plan_check;
ALTER TABLE users ADD CONSTRAINT users_subscription_plan_check
  CHECK (subscription_plan IN ('FREE','TRIAL','PAID','EXPIRED'));

ALTER TABLE users ADD COLUMN IF NOT EXISTS
  subscription_started_at TIMESTAMPTZ NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS
  subscription_expires_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS users_subscription_plan_idx
  ON users (subscription_plan);
CREATE INDEX IF NOT EXISTS users_subscription_expires_at_idx
  ON users (subscription_expires_at)
  WHERE subscription_expires_at IS NOT NULL;
```

**설계 결정**
- `FREE` 가 기본값 → 기존 전 유저 자동으로 FREE(무중단).
- 별도 `subscription_status` 컬럼 안 둠 → plan + expires_at 2개로 충분히 표현 가능. 저장 중복을 만들지 않음.
- 이력은 별도 테이블로 분리(아래 3-2).

### 3-2. 감사 이력 `subscription_change_logs`

```sql
CREATE TABLE IF NOT EXISTS subscription_change_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL,
  prev_plan TEXT NULL,
  next_plan TEXT NULL,
  prev_expires_at TIMESTAMPTZ NULL,
  next_expires_at TIMESTAMPTZ NULL,
  reason TEXT NOT NULL,            -- 'admin-manual' | 'admin-bulk' | 'self-checkout' (미래) | 'system-lazy-expire'
  memo TEXT NULL,                  -- 관리자 메모(옵션)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sub_change_logs_user_id_idx
  ON subscription_change_logs (user_id, created_at DESC);
```

### 3-3. 전역 설정 `app_settings` (신설 — PR1 완료)

TRIAL 기본 기간·정책 스위치·그 외 전역 설정을 담을 key-value 테이블.

```sql
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by_user_id TEXT NULL REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO app_settings (key, value_json) VALUES
  ('subscription.policy_active',       CAST('false' AS jsonb)),
  ('subscription.trial_default_days',  CAST('30'    AS jsonb))
ON CONFLICT (key) DO NOTHING;
```

**읽기 경로**: 서버는 `server/subscription/appSettings.js` 의 TTL 5초 in-memory 캐시로 읽고, 관리자 변경 직후 `invalidateAppSettingsCache(key)` 로 즉시 무효화한다. 다중 인스턴스 환경 도입 시 Redis pub/sub 또는 Postgres LISTEN/NOTIFY 로 교체.

**스위치 ON 플로우** (PR1a 완료, 관리자 UI 는 PR5):
1. 관리자가 `/admin/users` 에서 유저별 plan 정리(활성화 대상만 FREE 로 남기고, FREE 유지가 필요한 유저는 별도로 PAID/EXPIRED 로 전환)
2. `/admin/settings` 에서 `subscription.trial_default_days` 확인/조정(기본 30일, 1~365 클램프)
3. "정책 활성화" 버튼 → 확인 다이얼로그 → `POST /api/admin/subscription/activate`
   - `trialDays?`(선택), `dryRun?`(영향 규모만 조회), `memo?` 파라미터 지원
   - 단일 트랜잭션:
     - FREE 이고 started_at/expires_at 둘 다 NULL 인 구독 주체 유저를 row-lock
     - `plan='TRIAL'`, `started_at=NOW()`, `expires_at=NOW()+interval(trialDays days)` 로 UPDATE
     - `subscription_change_logs` 에 `reason='policy-activation'` 로 전수 기록
     - `subscription.policy_active=true` 로 플래그 전환
4. 이후 TRIAL 타이머가 흐르고 만료된 유저는 `effective_status='EXPIRED'` 가 된다.

**스위치 OFF** (`POST /api/admin/subscription/deactivate`): `policy_active=false` 만 내림. 각 유저의 `plan`/`started_at`/`expires_at` 는 **보존**(재개 시 잔여 기간 이어서 소진). 긴급 롤백 수단.

**현재 상태 조회** (`GET /api/admin/subscription/policy`): 플래그·trial 기본 일수·영향 유저 수(활성화 대상 / TRIAL 유저 수 / 현재 만료된 유저 수) 한 번에 반환.

**확장성**: 추후 `payment.default_plan_price`, `ui.announcement_banner` 등도 이 테이블에 쌓는다.

---

## 4. PR 분할 및 머지 순서

> 각 PR 은 **하위 호환** 을 유지한다. `policy_active=false` 기본값 덕에 어느 단계에서 배포를 멈춰도 회귀 없음.

### ✅ PR1 — 데이터 모델 + 정책 함수 + 로그인/`/me` 응답 확장 (완료, develop+main 머지 `7b5eabf`)

**파일 (실제 반영분)**
- `server/initDb.js` — §3-1/3-2/3-3 스키마 추가 (TRIAL 기본 일수 30, `policy_active=false`)
- `server/subscription/policy.js` — `evaluateSubscription`, `SUBSCRIPTION_SUBJECT_ROLES`, `normalizeSubscriptionPlan`
- `server/subscription/applyToResponseUser.js` — `buildSubscriptionResponse` / `buildSubscriptionResponseForUser`
- `server/subscription/appSettings.js` — TTL 5s in-memory 캐시 + `readPolicyActive` / `readTrialDefaultDays` / `invalidateAppSettingsCache`
- `server/registerUserProfileApi.js` — `/api/me` 응답에 snake_case `subscription` 병합 (USER 전용)
- `src/features/subscription/policy.ts` — 서버와 동일 로직 TS 미러
- `src/features/auth/authApi.ts` — `SubscriptionResponsePayload` / `AuthUser.subscription` 타입 추가, 로그인 응답 camelCase 매핑
- `src/features/auth/AuthProvider.tsx` — `readSubscriptionSnapshot` 으로 localStorage 복원·검증

**완료 상태**: `policy_active=false` 여서 전 유저 `effective_status='ACTIVE'`, `reason='policy-inactive'`. 라우트/UI 변경 없음, 기존 기능 회귀 없음.

---

### ✅ PR1a — 정책 활성화 기계장치 + 관리자 API (완료, develop+main 머지 `c1c9216`)

**파일 (실제 반영분)**
- `server/subscription/activatePolicy.js` — `activateSubscriptionPolicy` / `deactivateSubscriptionPolicy` / `getSubscriptionPolicyStatus` (단일 트랜잭션·멱등·dryRun·row lock·감사 로그)
- `server/registerSubscriptionAdminApi.js` — `/api/admin/subscription/{policy,activate,deactivate}` (SUPER_ADMIN 전용)

**완료 상태**: 서버 재부팅 없이 관리자가 `POST /api/admin/subscription/activate` 한 번으로 정책 발효. 취소는 `/deactivate` 로 플래그만 내리면 즉시 단락 통과.

**미검증(수동 테스트로 확인 필요)**: 실제 `curl` / 관리자 UI 없이는 사용자 확인이 어려움 → PR5 관리자 UI 전까지는 운영 관리자가 `curl` 로 트리거하는 방식으로 남겨둠.

---

### ✅ PR2 — 서버 접근 제어 미들웨어 + `/api/subscription/me` (완료, main 머지)

**파일**
- `server/subscription/requireActiveSubscription.js` **(신규)** — 화이트리스트 prefix 목록 통과, 나머지는 `buildSubscriptionResponseForUser()` 로 판정해 `effective_status==='EXPIRED'` 일 때 403 응답(`{ error:'SUBSCRIPTION_EXPIRED', message, subscription }`)
- `server/subscription/expiredAllowlist.js` **(신규)** — `EXPIRED_ALLOW_API_PREFIXES` SSOT (§2-4)
- `server/subscription/endpoints.js` **(신규)** — `GET /api/subscription/me` (유저 본인 구독 상태 조회), `POST /api/subscription/checkout` (501 "준비중")
- `server/index.js` — `requireAuth` 뒤에 prefix 기반 global 미들웨어 장착(§5-3 결정)

**완료 조건**:
1. 관리자 `curl` 로 임의 유저를 `EXPIRED` 강제 설정 → 업무 API 403(`SUBSCRIPTION_EXPIRED`), `/api/me` / `/api/subscription/me` / `/api/feature-request` 200 유지.
2. `policy_active=false` 상태에서는 EXPIRED 유저로 설정해도 전부 200 (정책이 전원 ACTIVE 로 단락).
3. `GET /api/subscription/me` 는 자신의 subscription 스냅샷을 `/api/me` 와 동일 구조로 반환.

---

### ✅ PR3 — 프론트 라우트 가드 + 메뉴 필터 (완료, main 머지) + `useSubscription` 훅

**파일**
- `src/features/subscription/useSubscription.ts` **(신규)** — `AuthProvider` 의 session.user.subscription 을 읽고, 앱 진입 후 주기적(5~10분)으로 `/api/subscription/me` 를 재조회해서 최신화
- `src/features/subscription/RequireActiveSubscription.tsx` **(신규)** — `<Outlet/>` 래퍼, `effective_status==='EXPIRED'` 면 `/profile?expired=1` 로 redirect
- `src/appRouter.tsx` — `/profile`, `/feature-request`, `/account/reset` 를 래퍼 **바깥**에, 나머지 업무 라우트를 **안**에 배치
- `src/features/dashboard/gaTenantMenu.ts` — `buildGaTenantDashboardMenu(…, { effectiveStatus })` 로 확장. EXPIRED 면 `내정보관리` / `문의·요청` 만 반환
- `src/layouts/AppWorkspaceLayout.tsx` — 메뉴 빌드 시 subscription 상태 주입

**완료 조건**: EXPIRED 테스트 유저로 로그인 → 메뉴에 `내정보관리` / `문의·요청` 만 표시 → 업무 URL 직타 시 `/profile?expired=1` 로 리다이렉트. 일반(FREE / policy-inactive) 유저는 기존 동작 완전 동일.

---

### ✅ PR4 — 내 정보 관리 UI (구독 섹션) (완료, main 머지)

**파일**
- `src/features/subscription/components/SubscriptionStatusCard.tsx` **(신규)** — 현재 플랜/만료일/남은기간/결제 안내
- `src/features/subscription/components/ExpiredBanner.tsx` **(신규)** — EXPIRED 유저용 상단 배너("이용 종료 — 결제/문의로 이동")
- `src/features/auth/pages/ProfilePage.tsx` — `SubscriptionStatusCard` 삽입
- `src/layouts/AppWorkspaceLayout.tsx` — effectiveStatus === 'EXPIRED' 이면 상단에 `ExpiredBanner` 렌더 (모바일/PC 공용)

**텍스트 상수 SSOT**: `src/features/subscription/copy.ts` — 플랜별 설명 문구를 한 곳에서 관리.

**완료 조건**: 각 상태별 유저가 `/profile` 진입 시 자신의 상태가 한 줄로 이해된다. EXPIRED 는 화면 전체에서 안내 배너가 상시 보인다.

---

### ✅ PR5 — 관리자 일괄 관리 UI + 단건/일괄 변경 API (완료, main 머지)

**백엔드 — 실제 구현**
- `server/subscription/adminUserEndpoints.js` **(신규, `registerSubscriptionAdminUserEndpoints`)**
  - `GET  /api/admin/subscriptions/users` — 필터(`gaId`, `plan`, `effectiveStatus`, `nearExpiry`, `expiredOnly`, `q`) + 페이지네이션(`page`, `pageSize`). 결과는 `evaluateSubscription()` 을 통해 `effectiveStatus` / `remainingDays` 를 덧붙여서 반환.
  - `PATCH /api/admin/subscriptions/users/:userId` — 단건 변경(`plan` / `startedAt` / `expiresAt` / `memo`). 플랜에 맞게 날짜 필드 정규화(FREE/EXPIRED 는 기간 clear, TRIAL/PAID 는 필수).
  - `POST /api/admin/subscriptions/users/bulk` — 일괄 작업(`userIds[]`, `action: SET_PLAN | EXTEND_DAYS | SET_EXPIRY`). 한 트랜잭션 내에서 per-row 갱신 + 로깅.
  - `GET/PATCH /api/admin/settings/subscription` — `policy_active`(읽기 전용 노출) + `trial_default_days` 조회/수정. 수정 시 `writeTrialDefaultDays()` 로 1~365 범위 검증 + 캐시 무효화.
- 모든 변경은 `subscription_change_logs` 에 `reason: 'admin-manual' | 'admin-bulk'` 로 기록. `registerSubscriptionAdminApi` 에서 `registerSubscriptionAdminUserEndpoints` 호출로 통합.

**프론트 — 실제 구현**
- `src/features/admin/api/subscriptionAdminApi.ts` **(신규, API 클라이언트 SSOT)**
  - 인터페이스: `SubscriptionPolicyStatus`, `SubscriptionGlobalSettings`, `SubscriptionUserListFilters`, `SubscriptionUserRow`, `SubscriptionUserListResponse`, `UpdateSubscriptionUserBody`, `BulkSubscriptionAction`.
- `src/features/admin/pages/SubscriptionPolicyPage.tsx` **(신규)** — 정책 활성/비활성 + dry-run 미리보기 + 대상 유저 수/TRIAL/만료 요약. 파괴적 액션은 `useConfirmDialog` 로 보호.
- `src/features/admin/pages/SubscriptionUsersPage.tsx` **(신규)** — 필터 패널 + 체크박스 다중 선택 + `SubscriptionEditDialog` / `SubscriptionBulkToolbar` 결합. `UserManagementPage` 는 역할·계정 정보에 집중하도록 유지하고 구독 편집은 이 페이지로 분리.
- `src/features/admin/pages/AdminSubscriptionSettingsPage.tsx` **(신규)** — TRIAL 기본 일수 1~365 입력 + 현재 정책 활성 상태 읽기 전용 표시.
- `src/features/admin/components/SubscriptionEditDialog.tsx` **(신규)** — plan 변경에 따라 시작/만료일 입력 UI 가 동적으로 on/off.
- `src/features/admin/components/SubscriptionBulkToolbar.tsx` **(신규)** — 액션 종류에 따른 입력 필드 토글 + 기본 검증.
- `src/appRouter.tsx`·`src/features/dashboard/gaTenantMenu.ts` — `SuperAdminRoute` 하위에 `/admin/subscription/policy|users|settings` 라우트 3종 + 사이드바 메뉴 등록.

**완료 조건 — 충족**: 관리자가 UI 에서 "특정 GA 전체에 30일 TRIAL 부여" / "EXPIRED 유저만 7일 연장" / "개별 유저 PAID 전환" / "정책 활성화·비활성화" / "TRIAL 기본 일수 변경" 시나리오를 전부 수행 가능하며, 모든 변경은 `subscription_change_logs` 에 남는다.

---

### ✅ PR6 — 테스트 · 문서 정리 (완료)

- `server/subscription/policy.test.js` **(신규)** — Node 내장 `node:test` 기반 테이블-드리븐 테스트. 다음 `reason` 분기를 전부 검증:
  - `policy-inactive` / `not-subject` / `free` / `trial-active` / `trial-expired` / `paid-active` / `paid-expired` / `forced-expired`
  - 경계값: `expiresAt == now` 는 만료 처리, `TRIAL + expiresAt=null` 은 데이터 결손 방어로 EXPIRED.
  - `normalizeSubscriptionPlan` 의 비정상 입력 방어(알 수 없는 값/비문자열 → `FREE`).
- `package.json` 에 `"test": "node --test \"server/**/*.test.js\""` 스크립트 추가 → `npm test` 로 12개 케이스 전부 통과.
- 이 계획 문서(`docs/refactor-plans/subscription-access-control.md`) 를 최종 상태로 갱신.

**의도적으로 보류한 항목(후속 개선 후보)**
- `src/features/subscription/policy.test.ts` — 프론트 미러 단위 테스트. 현재는 **서버-프론트 정책 함수 구조가 1:1 대응**이고 EXPIRED 판정의 최종 권위는 서버이므로, Vitest 도입 비용 대비 이득이 작아 서버 테스트로 통일. 이후 Vitest 환경이 도입되면 같은 테이블을 그대로 복제하면 됨.
- `server/subscription/activatePolicy.test.js` — 활성화 멱등성/dryRun 테스트. 현재 구현은 이미 "활성 시 재호출은 no-op, dryRun 은 쓰기 없음" 을 보장하고 수동 검증 완료. DB 픽스처 부담이 커서 보류.
- `docs/ops/subscription.md` 운영 가이드 — 본 계획 문서가 정책/운영 절차까지 포함하고 있어 당장 중복. 운영자 피드백이 쌓이면 그때 별도 문서로 분리.

**완료 조건 — 충족**: `npm test` 로 정책 함수가 회귀 검증되며, 이 문서가 현재 배포 상태를 정확히 반영.

---

## 5. 설계 결정과 트레이드오프

### 5-1. **DB `plan` vs 런타임 계산** — 런타임 계산 채택
- 장점: cron 불필요, 시차/일광시간 변경에도 안전, "지금 이 순간" 정확.
- 단점: 관리자 리스트에서 `effective_expired` 로 필터링하려면 SQL 에서 `WHERE plan IN ('TRIAL','PAID') AND expires_at <= NOW() OR plan='EXPIRED'` 조건을 명시 필요 → 관리자 API 에서 이 계산을 서비스 층에 캡슐화.

### 5-2. **화이트리스트 vs 블랙리스트** — 화이트리스트 채택
- 신규 API/경로 추가 시 **기본값이 차단**. 개발자가 "이건 EXPIRED 도 허용" 이라고 명시해야 허용됨 → 보안 사고 방지.
- 트레이드오프: 일시적으로 EXPIRED 가 접근해야 할 새 엔드포인트가 생기면 의식적으로 등록해야 함 → 정책 파일(`EXPIRED_ALLOW_API_PREFIXES`) 하나에만 추가하면 됨.

### 5-3. **route-level vs global 미들웨어** — **path-prefix 기반 global** 채택
- 기존 코드가 route 단위로 `requireAuth` 를 붙이는 패턴이라 route 별로 `requireActiveSubscription` 추가는 회귀 범위가 크다.
- 대신 `app.use((req,res,next)=>...)` 전역에서 `req.path` 가 화이트리스트면 통과, 아니면 `requireAuth` 후 판정.
- 비인증 경로(로그인·회원가입·공개 페이지)는 `requireAuth` 가 없으므로 건너뛰어야 함 → 미들웨어가 `req.user` 있을 때만 동작.

### 5-4. **관리자 UI 확장 vs 분리** — `/admin/users` 확장 채택
- 같은 유저 레코드를 두 화면에서 편집하면 Mental model 이 분열됨.
- 플랜 컬럼이 추가되어도 유저 관리 UI 의 정체성은 그대로.
- 단, 필드·액션이 많아지면 탭 구조(`/admin/users` 의 "계정 정보" / "구독" 탭)로 내부 분할.

### 5-5. **TRIAL 기본 기간 저장 위치** — `app_settings` 테이블 채택
- env 변수로 하면 변경 시 서버 재배포 필요.
- 코드 상수로 하면 GA별 차등이 불가.
- DB 테이블은 관리자 UI 에서 즉시 변경 가능 + 확장성(장래 공지·기능 플래그).

### 5-6. **FREE 유저의 `expires_at`** — 항상 `NULL`
- 억지로 채우면 의미 혼동(10년 뒤 expires_at 같은 패턴). 
- CHECK 제약으로 `plan='FREE' AND expires_at IS NOT NULL` 같은 잘못된 상태를 방지할 수도 있으나 관리자 실수 시 500 에러 대신 서비스 층에서 정규화(`plan=FREE` 면 `expires_at=NULL` 로 강제)로 흡수. 이쪽이 운영 친화적.

### 5-7. **구독 대상 범위** — GA 일반 유저만
- 담당자 계정(INSURER_MANAGER/LOSS_ADJUSTER) 은 `insurer_managers` / `loss_adjusters` 별도 테이블. 이들은 GA 의 외부 협력사 성격 → 지금 스코프 제외.
- 정책 함수가 `role` 을 보고 "not-subject" 로 돌려주므로 확장 시 정책 파일 한 줄만 수정.

---

## 6. 회귀 방지 전략 / 수동 검증 기록

- **각 PR 병합 직후**: `/dashboard` 정상 진입, 로그인, 로그아웃, `/profile` 열람 3종 기본 흐름 수동 체크 — 완료.
- PR2 머지 후: 테스트 계정을 DB 에서 수동 EXPIRED 설정 → 업무 API 가 403, 화이트리스트(`/api/auth/me`, `/api/subscription/me`, `/api/profile`, `/api/feature-requests/*` 등)가 200 — 완료.
- PR3 머지 후: EXPIRED 계정 로그인 → `/customers` 등 URL 직타 시 `/profile?expired=1` 로 리다이렉트되고 사이드바 메뉴가 "내 정보 관리 / 문의·요청" 만 노출 — 완료.
- PR5 머지 후: 관리자 일괄 작업 3종(특정 GA 30일 TRIAL / EXPIRED 7일 연장 / 개별 PAID 전환)·정책 활성화·비활성화 수행, `subscription_change_logs` 에 기록 확인 — 완료.
- 상시 가드: 신규 API 추가 시 EXPIRED 허용 여부를 `enforceActiveSubscription` 화이트리스트에 의식적으로 등록(누락 시 기본 차단 → 사고 방지).

---

## 7. 열어둔 후속 과제 (스코프 밖)

- 실제 PG 결제 연동 (`POST /api/subscription/checkout` 내부 구현)
- 자동 영수증/청구서 발송
- 이메일 만료 임박 알림(D-7, D-1)
- GA 단위 플랜(여러 유저가 GA 계약에 묶이는 형태)
- INSURER_MANAGER / LOSS_ADJUSTER 계정 구독 확장
- Vitest 기반 프론트 정책 미러 테스트(`src/features/subscription/policy.test.ts`)
- `server/subscription/activatePolicy.test.js` — DB 픽스처 정비 후 멱등성/타이머 보존 회귀 테스트
- `subscription_change_logs` 관리자 뷰 페이지

---

## 8. 변경 지점 가이드 — "이후 수정은 어디서 하나"

- **정책 판정 로직**: `server/subscription/policy.js` + `src/features/subscription/policy.ts` 두 곳이 미러. 새로운 `reason` / 상태 분기 추가 시 둘 다 같이 고치고 `server/subscription/policy.test.js` 에 케이스 추가.
- **EXPIRED 허용 API/경로 추가**: 서버는 `server/subscription/enforceActiveSubscription.js` 의 화이트리스트, 프론트는 `src/features/subscription/allowedPaths.ts`.
- **TRIAL 기본 일수/정책 활성 여부**: DB `app_settings` 테이블 + 관리자 화면(`/admin/subscription/policy`, `/admin/subscription/settings`). 코드/환경변수 수정 없이 운영 중 변경 가능.
- **관리자 단건/일괄 액션 확장**: `server/subscription/adminUserEndpoints.js` 의 `BulkSubscriptionAction` 분기 + `SubscriptionBulkToolbar` 의 액션 스펙을 함께 업데이트.
- **구독 섹션 UI 문구**: `src/features/subscription/copy.ts` 한 파일.
- **실제 결제 연동 붙일 때**: `server/subscription/` 하위에 `checkout.js` 추가 + `plan` 갱신은 반드시 `subscription_change_logs` 에 `reason: 'payment-success'` 로 남기고, 성공 시 `evaluateSubscription()` 이 자동으로 ACTIVE 로 전환되므로 정책 코드 수정 불필요.
