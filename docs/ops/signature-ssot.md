# 서명 기능 연동 가이드 (R2 + `signature` SSOT)

> 상태: **develop 반영 완료**  
> 목적: 다른 기능 개발 중에도 동일한 서명 저장 구조를 재사용하도록, 현재 구현의 단일 기준(SSOT)을 문서화한다.

---

## 1) 아키텍처 개요

- 서명 원본 데이터는 **항상 PNG 파일로 R2(또는 로컬 fallback 스토리지)** 에 저장한다.
- DB에는 base64를 저장하지 않고, `signature` 테이블에 메타만 저장한다.
- 현재 유효한 서명은 `status='active'` 1건만 유지하며, 교체 시 기존 active는 `replaced`로 전환한다.
- 이후 어떤 도메인(동의서/PDF/신청서)이든 `signatureId`를 참조해 연결하는 것을 원칙으로 한다.

---

## 2) 범위 / 비범위

### 이번 단계 포함

- 서명 입력(캔버스)
- 서명 저장(R2 업로드 + DB 저장)
- 저장 직후 미리보기
- 다시 작성(교체 저장)

### 이번 단계 제외

- PDF 삽입
- 전자서명 인증
- 복잡한 문서 연결 로직

---

## 3) 서버 구성

### 3.1 스키마 (`server/initDb.js`)

`ensureSignatureSchema()`가 `initDb()`에서 호출된다.

테이블: `signature`

- `id` (TEXT, PK)
- `ga_id` (NOT NULL)
- `customer_id` (NULL 허용)
- `signer_type` (`USER` / `CUSTOMER`)
- `signer_id`
- `related_type` (NULL 허용)
- `related_id` (NULL 허용)
- `file_key` (R2 경로)
- `created_at`
- `created_by`
- `status` (`active` / `replaced` / `deleted`)

핵심 제약:

- `uq_signature_active_context`
  - `(ga_id, signer_type, signer_id, customer_id, related_type, related_id)` 컨텍스트에서
  - `status='active'`는 최대 1건만 허용

### 3.2 API (`server/registerSignatureApi.js`)

- `POST /api/signatures`
  - 입력: `signatureDataUrl`(PNG), `signerType`, `signerId`, `customerId?`, `relatedType?`, `relatedId?`, `replaceSignatureId?`
  - 동작:
    1. PNG 데이터 검증 + 용량 제한
    2. 스토리지 업로드
    3. 기존 active를 `replaced` 처리
    4. 새 row를 `active`로 insert
    5. preview URL 반환
- `GET /api/signatures/file?token=...`
  - 서명 PNG 미리보기 응답

### 3.3 파일 경로 규칙 (고정)

`signatures/{gaId}/{customerId|temp}/{signatureId}.png`

- `customerId`가 없으면 `temp`
- 파일명은 `signatureId`

---

## 4) 프론트 구성

### 4.1 컴포넌트

- `src/features/consent/components/SignaturePad.tsx`
  - canvas 기반
  - pointer 이벤트 + mouse/touch fallback
  - clear / empty 체크 / PNG export
- `src/features/consent/components/SignatureModal.tsx`
  - 하단 버튼: `지우기 / 취소 / 저장`
  - 빈 서명 저장 방지
  - 저장 에러 메시지 처리

### 4.2 API 클라이언트

- `src/features/consent/api/signatureApi.ts`
  - `saveSignature(token, body)`

### 4.3 PNG 변환

- `src/features/consent/utils/signaturePng.ts`
  - retina 해상도 유지
  - 과도한 용량 시 축소 재시도

---

## 5) 현재 연결 지점 (동의서 플로우)

- 페이지: `src/features/consent/pages/ConsentFormPage.tsx`
- 폼: `src/features/consent/components/ConsentForm.tsx`

동작:

1. 사용자 서명 입력
2. `saveSignature()` 호출
3. 응답의 `id`, `previewUrl` 저장
4. 화면에 미리보기 표시
5. 다시 작성 시 `replaceSignatureId`를 함께 보내 교체 저장

참고:

- 현재 동의서 PDF 생성 요청(`generateConsentPdf`)에는 서명 이미지를 직접 넣지 않도록 분리되어 있다.
- 후속 기능에서는 `signatureId` 기준으로 PDF 렌더 단계에서 조회/삽입하도록 연결한다.

---

## 6) 연동 시 개발 규칙

새 화면/도메인에서 서명 기능을 붙일 때 아래를 지킨다.

1. 캔버스 데이터(base64)를 DB에 직접 저장하지 않는다.
2. 기능별 별도 서명 테이블을 만들지 않는다 (`signature` 단일 SSOT 유지).
3. 저장 성공 후에는 항상 `signatureId`를 상위 상태/도메인 데이터에 보관한다.
4. 교체 저장은 `replaceSignatureId`를 사용한다.
5. 다른 사람의 `signerId`로 저장 가능하게 열어두지 않는다(권한 검증 유지).

---

## 7) 트러블슈팅 메모

### 증상: 모달은 뜨는데 필기가 안 됨

원인(과거 이슈):

- `onDirtyChange` 콜백 참조가 리렌더마다 바뀌어 패드 초기화 effect가 재실행됨
- 그리는 즉시 캔버스가 지워져 “입력이 안 되는 것처럼” 보임

해결:

- `SignaturePad` 내부에서 `onDirtyChange`를 ref로 유지
- `SignatureModal`에서 dirty 콜백을 `useCallback`으로 고정

---

## 8) QA 체크리스트

- 서명 모달 열기 가능
- PC 마우스 드로잉 가능
- 모바일 터치 드로잉 가능
- 빈 상태 저장 불가
- 지우기 동작
- 저장 성공 후 미리보기 표시
- 다시 작성 후 새 서명으로 교체 표시
- DB `signature`에 active 1건만 유지
- 기존 active가 `replaced`로 전환
- 파일 경로가 규칙(`signatures/...`)을 따름

---

## 9) 다음 연결 포인트 (후속 작업용)

- PDF 삽입 단계에서 `signatureId`를 받아 파일을 조회해 렌더링
- 문서/요청 단위로 `relatedType`, `relatedId`를 표준화해 연결
- 서명 이력 조회 UI(최근 서명 선택) 추가 시에도 저장 구조는 변경하지 않는다

