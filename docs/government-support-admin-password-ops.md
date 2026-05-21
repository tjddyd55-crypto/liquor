# 정부지원 CRM — admin 비밀번호 운영 절차

> **범위:** CRM-government Railway **develop** / **production** 공통 원칙.  
> **절대 금지:** 이 문서·커밋·로그·채팅에 `GOVERNMENT_ADMIN_PASSWORD`, JWT, DB URL, 실제 비밀번호 값 기록.

---

## 1. 정상 운영 상태 (ENV)

| ENV | develop / production 권장 |
|-----|---------------------------|
| `GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED` | **false** (최초 1회 생성 후) |
| `GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP` | **false** |
| `GOVERNMENT_ADMIN_PASSWORD` | **미설정(삭제)** — 영구 로그인 수단으로 쓰지 않음 |
| `GOVERNMENT_ADMIN_LOGIN_ID` | bootstrap 시에만 사용; 이후 Railway Variables에 아이디만 유지 가능 |
| `GOVERNMENT_ADMIN_EMAIL` | **미사용** |

기동 로그에 `[government-bootstrap] password reset` / `user created` 등 **bootstrap·reset 메시지가 없어야** 정상이다.

---

## 2. admin 비밀번호 변경 (일반 운영)

bootstrap/ENV 비밀번호가 **아닌** 아래 경로만 사용한다.

### 2-1. 업종 관리자가 대행사 계정 비밀번호 초기화

1. 업종 관리자(`government_industry_admin`)로 로그인
2. **관리 → 직원 관리** (`/government/admin/users`)
3. 대상 사용자 **비밀번호** 버튼 → 새 비밀번호 입력·저장

**API (동일 동작):**

```http
POST /backend/api/government-support/admin/users/:userId/reset-password
Authorization: Bearer <industry-or-agency-admin-token>
Content-Type: application/json

{ "password": "<new-password>" }
```

권한: `requireGovernmentUserManager` (업종 관리자·대행사 관리자).  
**값은 요청 본문·로그·문서에 남기지 않는다.**

### 2-2. 본인 비밀번호 변경 (후속)

이용자·관리자 공통 **비밀번호 변경 UI/API**는 정부지원 CRM에서 별도 제공 예정.  
현재는 (2-1) 초기화 또는 bootstrap 1회 생성만 문서화된 경로다.

---

## 3. develop E2E / 테스트 계정

| 항목 | 설명 |
|------|------|
| 테스트 계정 | `e2e_ua_dev`, `e2e_ub_dev` (program user), `e2e_*` (E2E가 동적 생성) |
| 비밀번호 | **Railway/로컬 환경변수 `E2E_GOVERNMENT_PASSWORD`만** — repo에 저장 금지 |
| admin 로그인 E2E | `E2E_GOVERNMENT_ADMIN_LOGIN_ID`(기본 `admin`) + 동일 `E2E_GOVERNMENT_PASSWORD` |
| 시드 | `npm run e2e:government:seed-program-users` (develop DB, `railway run` 권장) |
| 임시 DB reset | `npm run e2e:government:reset-admin-password` — **develop 전용**, E2E 후 원복 정책 |

HTTP E2E는 **DB 없이** develop URL만 호출:  
`npm run e2e:government:operations` / `npm run e2e:government:user-workspace`

상세: [government-support-e2e.md](./government-support-e2e.md)

---

## 4. bootstrap이 필요한 경우 (최초 1회만)

1. Railway Variables에 일시 설정:  
   `GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED=true`, `GOVERNMENT_ADMIN_LOGIN_ID`, `GOVERNMENT_ADMIN_PASSWORD`
2. 재배포 → admin 계정·`government_industry_admin` 멤버십 생성 확인
3. 로그인 확인 후 **즉시**:
   - `GOVERNMENT_ADMIN_BOOTSTRAP_ENABLED=false`
   - **`GOVERNMENT_ADMIN_PASSWORD` 변수 삭제**
   - `GOVERNMENT_ADMIN_RESET_PASSWORD_ON_BOOTSTRAP=false`
4. 재배포 → bootstrap 로그 **미출력** 확인

---

## 5. develop admin 비밀번호를 E2E로 바꾼 경우

1. E2E 종료 후 (2-1) API/UI로 **운영자가 아는 비밀번호**로 재설정  
   또는 develop에서만 `e2e:government:reset-admin-password` + 이후 (2-1)으로 교체
2. **`GOVERNMENT_ADMIN_PASSWORD` ENV는 복구하지 않는다** (삭제 상태 유지)
3. Railway develop 기동 로그에 bootstrap/reset **없음** 재확인

---

## 6. production 절대 금지

- production Railway / main 브랜치 / 보험 DB에 E2E·seed·reset 스크립트 실행 금지
- `E2E_GOVERNMENT_ALLOW_NON_DEVELOP` 는 로컬 디버그 외 사용 금지

---

## 7. 관련 문서

- [government-crm-architecture.md](./architecture/government-crm-architecture.md) §7.4 Bootstrap / reset
- [government-support-e2e.md](./government-support-e2e.md)
