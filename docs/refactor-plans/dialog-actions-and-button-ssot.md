# 다이얼로그 액션 / 버튼 SSOT 정립 — Handoff 노트

> **브랜치**: `refactor/dialog-actions-and-button-ssot` → `develop`
> **목적**: 페이지마다 버튼 모양·풋터 배열이 제각각인 회귀의 **근본 원인**("공용 규약 부재") 을
> 구조적으로 차단한다. 개별 호출부 이관은 별도 브랜치로 점진 진행.

---

## 1. 이번 브랜치에서 한 일 (SSOT 정립)

### 1.1 `.button` 공용 CSS 강화 (`src/index.css`)

- `-webkit-tap-highlight-color: transparent` 추가 → 안드로이드 ripple / iOS 회색 박스
  같은 네이티브 터치 하이라이트 제거. 탭 피드백은 `.button:active` transform/opacity 만 담당.
- `user-select: none` 추가 → 길게 누름 시 텍스트 드래그 선택이 탭을 가로채지 않음.
- 위 두 항목을 **공용 수준** 에서 정의하므로 모든 variant·size 가 자동 혜택.

### 1.2 `<DialogActions>` primitive 신설 (`src/components/dialog/DialogActions.tsx`)

- 다이얼로그 풋터의 **레이아웃(정렬 · 간격 · 줄바꿈) 만** 책임진다.
- 버튼 모양·크기는 공용 `<Button>` 의 variant/size 로만 표현 — primitive 내부에서
  절대 모양을 덮지 않는다 (페이지마다 달라지는 회귀 재발 방지).
- 기본 정렬: 오른쪽 정렬 + flex-wrap. 좁은 폭에서도 버튼이 잘리지 않고 자연스럽게 줄바꿈.
- `.dialog-actions` 레이아웃 클래스는 `src/index.css` 에 함께 정의.

### 1.3 `ConfirmDialog` 가 모범 사례로 정돈 (`src/components/dialog/ConfirmDialog.tsx`)

- 인라인 `<div className="mt-5 flex flex-wrap justify-end gap-2">` → `<DialogActions>` 로 교체.
- `busy` 처리중 텍스트를 `{busy ? '처리 중…' : confirmLabel}` 수동 분기에서
  `<Button loading={busy}>` 로 이관 — 공용 Button 의 loadingText 규약을 그대로 사용.

### 1.4 규약 명시 (JSDoc)

- `src/components/ui/Button.tsx` — variant/size 의미와 "className 으로 모양 덮기 금지" 규칙.
- `src/components/form/FormButton.tsx` — "공용 Button 의 레거시 호환 래퍼" 로 명시.
  신규 코드는 `<Button>` 직접. 기존 호출부는 점진 이관.

---

## 2. 이관 대기 목록 (별도 브랜치로 진행)

### §2.1 스크린샷 "캡슐형 닫기" 추적 (우선)

- 사용자가 지적한 스크린샷 2번의 캡슐 모양 "닫기" 는 `.button` 기본
  `border-radius: 10px` 을 초과하는 **커스텀 오버라이드** 다. 어느 페이지인지
  사용자 확인이 필요.
- 후보 (모바일 모달 풋터):
  - `src/features/customers/components/mobile/CustomerFilesModal.tsx`
  - `src/features/customers/components/mobile/CustomerConsultationsModal.tsx`
  - `src/features/customers/components/mobile/CustomerAutoModal.tsx`
  - `src/features/customers/components/mobile/CustomerGaDataModal.tsx`
  - `src/features/web/components/ExcelUploadGuide.tsx`
- 작업 절차:
  1. 해당 파일에서 `rounded-full` / `rounded-2xl` / `border-radius` 커스텀 찾기.
  2. 풋터를 `<DialogActions><Button variant="secondary">닫기</Button></DialogActions>` 로 교체.
  3. 캡슐이 필요한 이유가 분명하다면(디자인 의도) `<Button>` 에 새 variant 를 제안 —
     페이지별 override 금지 규약.

### §2.2 `FormDialog.footer` 자유형식 풋터 정리

- `FormDialog` 는 footer 를 자유 ReactNode 로 받는다. 호출부 전수 조사 후
  풋터를 `<DialogActions>` 로 감싸고 `<Button>`/`<FormButton variant="...">` 명시.
- 전수 조사 단초:
  - `grep -rn "FormDialog" src/ --include="*.tsx"` → `footer={...}` 패턴 확인.

### §2.3 native `<button>` 잔재 제거

- `src/features/feature-request/pages/FeatureRequestPage.tsx:282` 의
  `no-restricted-syntax` lint 에러(pre-existing) 를 포함해, 풋터/액션 자리의 native
  `<button>` 을 `<Button>` / `<FormButton>` 으로 치환.

### §2.4 필터 칩 별도 primitive (추후)

- 스크린샷 1번 "30세 이하 남성 / 40세 이상 여성" 같은 필터 칩은 **행동 버튼이 아니라
  상태 표식** 이다. `<Button>` 과 섞지 말고 `<FilterChip>` / `<ToggleChip>` 으로 분리.
- 고객관리 필터 UI 개편 타이밍에 맞춰 진행 — 지금 규격을 못박으면 추후 UX 변경과 충돌.

---

## 3. 적용 규약 (이 브랜치 이후 모든 신규/수정 코드)

1. 다이얼로그 풋터는 **반드시** `<DialogActions>` 로 감싼다.
2. 풋터 안의 버튼은 `<Button>` 또는 `<FormButton variant="...">` — native `<button>` 금지.
3. variant 의미를 엄수: **주 액션=primary · 보조(취소/닫기)=secondary · 파괴=danger**.
4. 버튼 모양(`border-radius`, `background`, `font-weight` 등) 을 `className` 으로
   덮지 않는다. 새 형태가 필요하면 공용 variant 를 제안한다.
5. 버튼 순서는 좌 → 우, 의미 약한 것(취소/닫기) 이 좌, 주 액션이 우.

---

## 4. 회귀 테스트 체크리스트

- [ ] 모바일에서 ConfirmDialog 열고 "삭제" 탭 직후 원형 ripple glow 가 **나오지 않음**
- [ ] 모바일에서 버튼 롱프레스 시 텍스트 선택 파란 박스가 **나타나지 않음**
- [ ] PC 에서 ConfirmDialog 취소·확인 위치·간격이 기존과 동일
- [ ] PC/모바일 어디서도 ConfirmDialog 풋터가 짤리지 않고 좁은 폭에서 자연 줄바꿈
- [ ] `busy` 상태에서 "처리 중…" 텍스트가 confirm 버튼에 노출되고 취소도 disabled
