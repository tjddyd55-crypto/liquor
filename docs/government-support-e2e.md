# 정부지원 CRM — develop HTTP E2E

> **대상:** Railway `CRM-government` / **develop** / `app`  
> **URL:** `https://app-develop-9663.up.railway.app`  
> **production/main·보험 CRM에서 실행 금지**

---

## 1. 사전 조건

1. develop 배포 SUCCESS, `GET /backend/health` → 200
2. 테스트 계정 시드(최초 1회):  
   `railway run -e develop -s app npm run e2e:government:seed-program-users`  
   (`e2e_ua_dev`, `e2e_ub_dev` program user)
3. 환경변수 (값은 **커밋·문서·로그 금지**):

| 변수 | 필수 | 설명 |
|------|------|------|
| `E2E_GOVERNMENT_PASSWORD` | **예** | develop E2E·테스트 계정 공통 비밀번호 |
| `E2E_BASE_URL` | 아니오 | 기본 `https://app-develop-9663.up.railway.app` |
| `E2E_GOVERNMENT_ADMIN_LOGIN_ID` | 아니오 | 기본 `admin` |
| `E2E_GOVERNMENT_USER_A` | 아니오 | 기본 `e2e_ua_dev` |
| `E2E_GOVERNMENT_USER_B` | 아니오 | 기본 `e2e_ub_dev` |

PowerShell 예 (비밀번호는 팀 비밀 저장소에서 복사):

```powershell
$env:E2E_GOVERNMENT_PASSWORD = '<from-team-secret-store>'
npm run e2e:government:user-workspace
```

---

## 2. npm scripts

| 명령 | 용도 |
|------|------|
| `npm run e2e:government:operations` | 공지·자료 HTTP E2E (DB 불필요) |
| `npm run e2e:government:user-workspace` | 이용자 workspace·사업장·A/B 격리 E2E |
| `npm run e2e:government:operations:db` | DB+HTTP 통합 E2E (`railway run` 필수) |
| `npm run e2e:government:seed-program-users` | develop program user 시드 |
| `npm run e2e:government:reset-admin-password` | develop admin `password_hash` 임시 갱신 (E2E용) |

---

## 3. 스크립트 파일

| 파일 | DB | 설명 |
|------|-----|------|
| `server/scripts/e2eGovernmentOperationsHttp.mjs` | 없음 | 공지·자료·tenant 격리 |
| `server/scripts/e2eGovernmentUserWorkspaceHttp.mjs` | 없음 | 이용자 nav 번들·profiles·me/access |
| `server/scripts/e2eGovernmentOperationsDevelop.mjs` | **있음** | railway develop 전용 풀 E2E |
| `server/scripts/e2eSeedProgramUsers.mjs` | **있음** | `e2e_ua_dev` / `e2e_ub_dev` |
| `server/scripts/e2eResetAdminPassword.mjs` | **있음** | admin 비밀번호 hash 갱신 |
| `server/scripts/lib/e2eGovernmentHttpEnv.mjs` | — | develop 가드·env 공통 |

---

## 4. production 안전장치

- HTTP: 호스트가 `app-develop-9663` / localhost 외면 **즉시 종료**
- `insurance-production` 등 production 패턴 호스트 **차단**
- DB 스크립트: `DATABASE_URL` 없거나 production 패턴이면 **종료**
- 우회: `E2E_GOVERNMENT_ALLOW_NON_DEVELOP=1` (로컬 디버그만, CI/production 금지)

---

## 5. admin 비밀번호

ENV `GOVERNMENT_ADMIN_PASSWORD`는 **삭제 상태 유지**.  
운영·E2E 후속: [government-support-admin-password-ops.md](./government-support-admin-password-ops.md)

---

## 6. 기대 결과 (2026-05 develop)

| 스크립트 | 기준 |
|----------|------|
| `e2e:government:operations` | 25 pass / 0 fail |
| `e2e:government:user-workspace` | 37 pass / 0 fail |

---

## 7. E2E 데이터 정리

- `e2e_*` 동적 계정·공지·자료는 develop DB에 누적될 수 있음
- 주기적 정리 정책은 팀 합의 후 별도 수행 (production 영향 없음)
