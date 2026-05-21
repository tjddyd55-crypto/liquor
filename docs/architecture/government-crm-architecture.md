# 정부지원 CRM — 아키텍처·운영 기준

> **단일 기준 문서(SSOT)**  
> 정부지원 CRM(`government-support`)의 **제품 원칙(§0)·권한·데이터·운영·복제 방법**을 정리한다.  
> 배포·브랜치: 루트 `AGENTS.md`. 에이전트 규칙: `.cursor/rules/government-insurance-copy.mdc`  
> 단계별 이력: `docs/government-support-dev-progress.md`

**최종 검증 스냅샷 (develop):**

| 항목 | 상태 |
|------|------|
| Railway | CRM-government / **develop** / app |
| 공개 URL (dev) | `https://app-develop-9663.up.railway.app` |
| Source Branch | **develop** |
| 공지/전달사항 | 구현 완료 |
| 자료실/서식함 | 구현 완료 |
| E2E (HTTP) | 25 pass / 0 fail |
| production / main | **미변경** (develop만 반영) |

---

## 0. 제품 원칙 — 보험 CRM 마스터 복제 (고정)

정부지원 CRM은 **보험 CRM을 마스터**로 삼고, **화면·메뉴·리스트·상세·탭·좌측 리스트 + 우측 컨텐츠·대분류/소분류·기능 배치·PC/모바일 반응형**을 **그대로 복사**한다.

**바뀌는 것:** 데이터명, API, DB, 권한, R2, 문구. **바뀌지 않는 것:** 레이아웃·흐름·배치.

### 0.1 절대 금지

새 UI/UX 설계 · 새 화면 흐름 · 보험과 다른 레이아웃 · 독자 카드형 화면 · 보험 원본(`CustomersPage`, `features/contracts`, contract API) **직접 수정** · 보험/정부 **데이터·R2·템플릿 혼합** · 관리자에게 유저 소유 데이터 **전체 노출** · production/main/보험 DB/secret.

### 0.2 작업 절차

1. 보험 CRM 해당 기능 **소스 먼저 조사**
2. 정부 전용 경로로 **파일 복사**
3. §2 역할·§3 데이터 매핑으로 **이름·FK·가드만** 치환
4. `pdf-engine`, R2, `SignatureModal`, `ResponsiveLayout` 등 **공통 유틸 재사용**, scope는 분리

### 0.3 UI 목표 (2단계)

보험 `CustomersPage` / `CustomerWorkspaceLayout` 동형: **좌측 사업장·신청 리스트 + 우측 상세(메모·상담·진행·서류·전자서명 탭)**.  
현재 `/government/workspace`, `/my-businesses` 등 **분리 페이지는 과도기**.

### 0.4 우선순위

| 순서 | 범위 |
|------|------|
| **1** | 전자서명 — 보험 `contracts` → `gov_signature_*` (1차 포팅 완료, develop 검증 중) |
| **2** | 이용자 UI — 보험 고객관리 레이아웃으로 재정렬 |
| **3** | 메모·상담·진행·서류·신청 — 보험 모듈 **순차 복사** |

### 0.5 데이터 매핑 (요약)

보험 고객→정부 사업장/신청 대상 · GA→대행사 · contract 전자서명→`gov_signature_*` · 발송 시 **고객 선택→사업장(profile) 선택**.

---

## 1. 권한 구조

역할은 `user_memberships.role` 기준이며, JWT·`GET /api/government-support/me/access`의 `GovernmentAccessSummary`로 프론트·API 양쪽에서 검증한다. **메뉴 숨김만으로 권한을 대체하지 않는다.**

### 1.1 `government_user` (프로그램 이용자)

| 항목 | 내용 |
|------|------|
| **역할** | 사업장·고객·신청 데이터 **소유자** |
| **가입** | 대행사 **기관 코드**로 회원가입 (`/government/join`, `RegisterPage` + `government_user` 멤버십) |
| **화면** | `/government/workspace`(홈), `/government/my-businesses`, `/government/my-applications`, `/government/notices`, `/government/resources`, `/government/me` |
| **금지** | `/government/admin/*`, 운영 API CRUD, 타 대행사 데이터 |

### 1.2 `government_staff` (대행사 직원)

| 항목 | 내용 |
|------|------|
| **역할** | 소속 대행사 **운영 업무** (공지·자료 등록·전달) |
| **생성** | 대행사 관리자가 **직원 관리** API/UI로 생성 (`government_staff`) |
| **화면** | `/government/admin/notices`, `/government/admin/resources`, (내 정보 등) |
| **금지** | `/government/workspace` (프로그램 이용자 전용), 사업장/고객 **전체 목록·직접 CRUD** |
| **삭제/보관** | 공지·자료 **본인 작성분만** (agency admin은 tenant 전체) |

### 1.3 `government_agency_admin` (대행사 관리자)

| 항목 | 내용 |
|------|------|
| **역할** | 소속 대행사 **직원·이용자·운영** 관리 |
| **생성** | 업종 관리자 또는 상위 관리자가 사용자 관리 API로 생성 |
| **화면** | 직원 관리, 이용자 관리, 공지/자료 관리 (`governmentAdminNav.ts`) |
| **금지** | 사업장/고객 **전체 목록 메뉴**, 유저 소유 profile/application **직접 관리** |
| **운영 CRUD** | **자기 tenant** agency scope만 (global scope 생성·삭제 불가) |

### 1.4 `government_industry_admin` (업종 관리자)

| 항목 | 내용 |
|------|------|
| **역할** | 전체 대행사·플랫폼 설정·**global** 운영 |
| **생성** | ENV bootstrap(최초 1회) 또는 상위 관리 |
| **화면** | 대시보드, 대행사 관리, 공지/자료, 설정 |
| **운영 CRUD** | **전체 tenant** + **global** scope |

### 1.5 코드 SSOT

| 영역 | 파일 |
|------|------|
| 서버 접근 판별 | `server/lib/governmentSupport/governmentAccess.js` |
| 운영(공지·자료) 접근 | `server/lib/governmentSupport/governmentOperationsAccess.js` |
| 프론트 역할·게이트 | `src/features/government-support/lib/governmentAccess.ts`, `GovernmentProtectedRoute.tsx` |
| 관리자 메뉴 | `src/features/government-support/config/governmentAdminNav.ts` |

---

## 2. 보험 CRM 대응 관계

정부지원 CRM은 **보험 CRM의 역할·책임 분리**를 그대로 따른다. UI·라우트는 `/government/*`로 분리되어 있으나, **권한 모델의 mental model**은 아래 표를 기준으로 한다.

| 보험 CRM | 정부지원 CRM | 핵심 책임 |
|----------|--------------|-----------|
| 보험 **유저** (설계사·이용자) | `government_user` | 고객/사업장/신청 **소유** |
| **GA 관리자** | `government_agency_admin` | 직원·이용자·**운영** (유저 데이터 직접 관리 ✗) |
| **GA 직원** | `government_staff` | 공지·자료 **운영** (유저 데이터 직접 관리 ✗) |
| **플랫폼/업종 관리자** | `government_industry_admin` | 대행사·global 운영·설정 |

> **주의:** 보험 CRM의 `CustomersPage`·동적 템플릿 빌더와 코드를 공유하더라도, government-support는 **코드형 전용 CRM**이며 유저 데이터 API와 운영 API는 **모듈·테이블·R2 경로** 수준에서 분리한다.

---

## 3. 데이터 소유권

### 3.1 유저 소유 데이터 (User-owned)

| 데이터 | 테이블(예) | 소유자 | 접근 |
|--------|------------|--------|------|
| 사업장/고객 프로필 | `gov_support_profiles` | `owner_user_id` → `government_user` | 본인만 list/create/access |
| 신청·서류·전자문서 등 | `gov_support_application_cases`, `gov_support_document_items`, … | 동일 tenant + owner | 프로그램 이용자 워크스pace |

**서버 가드:** `canListGovernmentProfiles`, `canCreateGovernmentProfile`, `canAccessGovernmentProfile` (`governmentAccess.js`) — **staff/admin은 false**.

### 3.2 운영 데이터 (Operations)

| 데이터 | 테이블 | 관리 주체 |
|--------|--------|-----------|
| 공지/전달사항 | `gov_support_notices` | staff / agency admin / industry admin |
| 자료실/서식함 | `gov_support_resources` | 동일 |

**원칙:** 운영 계정은 유저 소유 데이터를 **조회·수정·삭제하지 않는다**. 이용자 관리 화면은 **요약·메타** 수준이며, 사업장/고객 **전체 목록 API**는 제공하지 않는다.

### 3.3 API 경계

| 구분 | 등록 위치 |
|------|-----------|
| 프로필·신청·첨부 | `registerGovernmentSupportApi.js` |
| 공지·자료 | `registerGovernmentOperationsApi.js` |

---

## 4. 대행사(tenant) 구조

### 4.1 다중 대행사

- 업종 관리자가 `POST /api/government-support/admin/agencies`로 **대행사(tenant) 다중 생성** 가능.
- 각 tenant는 `tenants` + `tenant_registration_codes`와 연결.

### 4.2 기관 코드 가입 → `government_user`

1. 대행사 생성 시 **기관 코드**(`tenant_registration_codes.code`) 발급.
2. 이용자는 `/government/join/:agencyCode` 또는 가입 폼에서 **기관 코드 + 휴대폰 인증** 후 가입.
3. `attachGovernmentProgramUserMembership` → `government_user` 멤버십 부여.
4. **프로그램 이용자 계정은 관리자 사용자 생성 API로 만들 수 없다** (코드 가입 전용).

### 4.3 관리자·직원 계정

| 생성 경로 | 역할 |
|-----------|------|
| 기관 코드 가입 | `government_user` |
| 대행사 관리자 → 직원/관리자 관리 API | `government_staff`, `government_agency_admin` |
| bootstrap / 업종 관리 | `government_industry_admin` |

### 4.4 tenant 격리

- **agency scope** 공지·자료: `tenant_id` 필수, **해당 tenant 멤버만** 조회.
- **global scope**: `tenant_id` null, **published** 시 모든 이용자에게 노출.
- 타 tenant 접근 시 API **403 또는 404**.

---

## 5. 공지/전달사항

### 5.1 데이터 모델 (`gov_support_notices`)

| 필드 | 설명 |
|------|------|
| `scope_type` | `agency` \| `global` |
| `tenant_id` | agency일 때 필수, global일 때 null |
| `title`, `content` | 제목·본문 |
| `category` | `general`, `important`, `deadline`, `document`, `system` |
| `status` | `draft`, `published`, `archived` |
| `is_pinned` | 중요 고정 |
| `published_at` | 공개 시각 |
| `created_by_user_id`, `updated_by_user_id` | 작성·수정자 |

### 5.2 scope 정책

| scope | 생성 | 이용자 노출 |
|-------|------|-------------|
| **global** | industry admin (super 포함)만 | published만, **전체** |
| **agency** | 해당 tenant 운영 계정 | published만, **소속 tenant** |

이용자는 **draft/archived 미노출**. global + 자기 tenant agency 공지만 목록에 포함.

### 5.3 API

| 메서드 | 경로 | 권한 |
|--------|------|------|
| GET | `/api/government-support/notices` | 멤버 공통 (이용자: published 필터) |
| GET | `/api/government-support/notices/:id` | 동일 + row-level read |
| POST/PATCH/DELETE | `/api/government-support/admin/notices` | `canManageGovernmentOperations` |

- 관리자 목록: `?managerView=true` (draft/archived 포함).
- DELETE: **archive** (`status → archived`).

### 5.4 CRUD 범위 요약

| 역할 | 생성 | 수정 | 삭제(보관) | 조회 |
|------|------|------|------------|------|
| industry admin | global + 전체 agency | 전체 | 전체 | managerView 전체 |
| agency admin | 자기 tenant agency | 자기 tenant | 자기 tenant (global ✗) | managerView tenant + global |
| staff | 자기 tenant agency | 자기 tenant | **본인 작성분만** | managerView tenant + global |
| user | ✗ | ✗ | ✗ | published, tenant + global |

### 5.5 화면

| 대상 | 경로 |
|------|------|
| 운영 | `/government/admin/notices` |
| 이용자 | `/government/notices` |

---

## 6. 자료실/서식함

### 6.1 데이터 모델 (`gov_support_resources`)

| 필드 | 설명 |
|------|------|
| `scope_type`, `tenant_id` | 공지와 동일 |
| `title`, `description` | 제목·설명 |
| `category` | `form`, `example`, `guide`, `manual`, `other` |
| `status` | `draft`, `published`, `archived` |
| `file_name`, `file_key`, `file_size`, `mime_type` | 파일 메타 |
| `published_at` | 공개 시각 |

### 6.2 R2 저장 경로

**유저 사업장 첨부와 절대 혼합하지 않는다.**

상대 경로 (SSOT: `governmentResourceStorage.js` + `r2KeyPolicy.withR2ObjectRoot`):

```text
{CRM_R2_OBJECT_ROOT}/government/resources/{tenantId|global}/{resourceId}/{uuid}_{sanitizedFileName}
```

- `CRM_R2_OBJECT_ROOT`: Railway ENV (예: `crm-platform/development/government/tenants`) — **값은 ENV에만** 두고 문서·로그에 기록하지 않는다.
- 업로드 key는 presign 응답의 `objectKey`로 서버가 검증 (`assertGovernmentResourceObjectKey`).

### 6.3 업로드·다운로드 플로우

1. **Presign:** `POST /api/government-support/admin/resources/presign`  
   - draft row 생성(필요 시) → presigned PUT URL 발급  
   - 허용 MIME: PDF, Office, ZIP, HWP, 이미지 등 (`governmentOperationsConstants.js`)
2. **PUT:** 클라이언트 → R2 (presigned URL, secret 미노출)
3. **저장:** `POST /api/government-support/admin/resources` (fileKey·메타·status)
4. **다운로드:** `GET /api/government-support/resources/:id/download` → presigned GET (이용자 read 포함)

### 6.4 CRUD·권한

공지와 **동일한** `governmentOperationsAccess` 규칙을 따른다 (scope, tenant, staff 삭제=본인 작성분).

### 6.5 화면

| 대상 | 경로 |
|------|------|
| 운영 | `/government/admin/resources` |
| 이용자 | `/government/resources` |

---

## 7. Railway 운영 기준

### 7.1 프로젝트·환경

| 항목 | 값 |
|------|-----|
| Project | **CRM-government** |
| develop (검증) | Environment **develop**, Service **app**, Branch **develop** |
| production (운영) | Environment **production**, Branch **main** |

develop URL: `https://app-develop-9663.up.railway.app`

### 7.2 배포·브랜치 (AGENTS.md 요약)

```text
작업 → develop 커밋 → develop push → [멈춤]
사용자 명시 지시 시에만 develop → main (ff-only) → main push
```

| push 대상 | 자동 반영 |
|-----------|-----------|
| **develop** | Railway **develop** app만 |
| **main** | Railway **production** + Electron + 모바일 OTA |

**정부지원 CRM 작업 시:** production/main/보험 DB는 **건드리지 않는다**.

### 7.3 ENV 원칙 (값 기록 금지)

문서·커밋·로그에 **절대 넣지 않는다:** `DATABASE_URL`, `JWT_SECRET`, R2 secret/access key, ALIGO API key, bootstrap 비밀번호.

| ENV (키 이름만) | 용도 |
|-----------------|------|
| `DATABASE_URL` | government 전용 Postgres (`${{Postgres.DATABASE_URL}}` reference) |
| `JWT_SECRET` | JWT 서명 |
| `CRM_R2_OBJECT_ROOT` | R2 object root prefix |
| `R2_*` | R2 연결 |
| `VITE_API_BASE_PATH` | 웹 same-origin API (`/backend`) |
| `APP_PRODUCT` | government 제품 식별 |

예시·체크리스트: `.env.railway.development.example`

### 7.4 Bootstrap / reset (운영 상태)

| ENV | 권장 상태 |
|-----|-----------|
| `GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED` | **false** (최초 생성 후) |
| `GOVERNMENT_ADMIN_LOGIN_ID` | bootstrap용 아이디 (값은 Railway만) |
| `GOVERNMENT_ADMIN_PASSWORD` | **설정 후 삭제** (영구 인증 수단으로 쓰지 않음) |
| `GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP` | **false** |
| `GOVERNMENT_ADMIN_EMAIL` | **미사용** |

- 로그인 식별: `users.username` (아이디 기반).
- bootstrap/reset 로그는 **정상 기동 시 출력되지 않아야** 한다.
- develop E2E 등으로 admin 비밀번호를 임시 변경한 경우, **운영 절차에 따라 DB/API 원복**한다.  
  → [government-support-admin-password-ops.md](../government-support-admin-password-ops.md)

### 7.5 헬스·기동 확인

- `GET /backend/health` → **200**
- 로그: `Government CRM server listening on port …`, `Government CRM DB engine: PostgreSQL`
- bootstrap/reset 메시지 **없음** 확인

---

## 8. 프론트 라우트 요약

| 경로 | 게이트 | 용도 |
|------|--------|------|
| `/government/login` | 공개 | 로그인 |
| `/government/join` | 공개 | 기관 코드 가입 |
| `/government/workspace` | `requireProgramUserWorkspace` | 이용자 홈 |
| `/government/my-businesses` | 동일 | 내 사업장 |
| `/government/my-applications` | 동일 | 내 고객/신청 |
| `/government/notices`, `/resources`, `/me` | 동일 | 공지·자료·내 정보 |
| `/government/signatures`, `/signatures/send` | `requireProgramUserWorkspace` | 전자서명 (보험 contracts UI 복제) |
| `/government/signature-templates` | 동일 | 템플릿·PDF 좌표 |
| `/government/sign/:token` | 공개 | 공개 서명 |
| `/government/admin/*` | `requireAdmin` / `requireOperational` / `requireUserManager` | 관리·운영 |

`government_user`에게 **`/government/admin/*` 메뉴·API 모두 차단**.

---

## 9. 검증

| 명령 | 용도 |
|------|------|
| `npm test` | 서버 단위 테스트 (`governmentOperationsAccess.test.js` 등) |
| `npm run build` | 프론트 프로덕션 빌드 |
| `npm run e2e:government:operations` | develop HTTP E2E — 공지·자료 (DB 불필요) |
| `npm run e2e:government:user-workspace` | develop HTTP E2E — 이용자 workspace·사업장·A/B 격리 |

상세·ENV·안전장치: [government-support-e2e.md](../government-support-e2e.md)  
admin 비밀번호 운영: [government-support-admin-password-ops.md](../government-support-admin-password-ops.md)

**develop E2E 기준 (2026-05):** 공지·자료 25 pass / 이용자 workspace 37 pass (0 fail).

---

## 10. 남은 이슈·후속 과제

| 우선순위 | 항목 | 설명 |
|----------|------|------|
| **P0** | 전자서명 develop E2E/수동 | PDF→좌표→템플릿→발송→공개서명→완료 PDF (보험 동형 검증) |
| **P1** | 이용자 UI 재정렬 | placeholder·분리 페이지 → 보험 `CustomersPage` 좌측 리스트+우측 상세 |
| **P2** | 메모·상담·진행·서류·신청 | 보험 해당 feature **복사 이식** (순차 PR) |
| P3 | E2E 테스트 계정 정리 | develop DB `e2e_*` 유지/삭제 정책 |
| P3 | 공지 읽음 확인 | read receipt / unread 배지 |
| P3 | 자료 다운로드 이력 | audit log |
| P3 | assignment 기반 staff 접근 | tenant 단위 운영만 (현재) |
| — | 문의/FAQ/보완 요청 | 1차 범위 제외 |

---

## 11. 관련 문서·코드

| 문서/경로 | 내용 |
|-----------|------|
| `AGENTS.md` | develop/main 배포, PC/Mobile 분리, **§ 정부지원 복제 원칙** |
| `.cursor/rules/government-insurance-copy.mdc` | 에이전트용 보험→정부 복제 규칙 |
| `docs/government-support-dev-progress.md` | 단계별 구현 이력 |
| `.env.railway.development.example` | develop ENV 키 체크리스트 |
| `server/lib/governmentSupport/schema.js` | DDL (`gov_support_notices`, `gov_support_resources`) |
| `server/registerGovernmentOperationsApi.js` | 운영 API 라우트 |

---

*문서 버전: develop `d6005ec` 기준 (전자서명 포팅 + §0 복제 원칙). production/main 미반영.*
