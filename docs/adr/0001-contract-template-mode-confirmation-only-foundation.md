# ADR — Contract Template Mode and Confirmation Only Foundation

## 상태

Accepted (2026-04-29) — DB·설계 기반 단계. API/프론트/완료 PDF 동작 변경은 포함하지 않음.

## 맥락

- 기존 **좌표형 PDF 전자서명**(`coordinate_pdf`)은 `pdf_template_id`와 PDF 엔진 좌표 필드에 기대며, 발송·고객 서명·완료·다운로드·증빙까지 일관된 파이프라인으로 동작한다.
- **무좌표 확인서**(`confirmation_only`)는 PDF 템플릿과 좌표 없이, 관리자가 정의한 항목과 확인 흐름만으로 확장할 계획이다.
- 두 모드를 한 테이블(`contract_templates`)에서 안전하게 구분하려면 스키마에 명시적 구분자가 필요하다.

## 결정

1. **`contract_templates.template_mode`**
   - 허용 값: `coordinate_pdf`, `confirmation_only`
   - 기본값: `coordinate_pdf` (기존 행 백필 포함)
   - CHECK 제약으로 값 집합 제한
2. **무좌표 확인 항목 정의**: `contract_template_confirmation_fields`
   - `contract_template_field_settings`(좌표 PDF 입력 역할) 및 `contract_template_fields`(레거시 좌표 테이블)과 **분리**
   - 템플릿 단위 `(template_id, field_key)` 유일
   - `input_type`은 `text`, `textarea`, `number`, `date`로 DB CHECK 제약
3. **이번 단계의 범위 제한**
   - `confirmation_only` 발송·고객 공개 화면 분기·완료 확인서 PDF 생성·증빙 해시 확장·외부 recipient 스냅샷은 **구현하지 않음**
   - `listFields(pdfTemplateId)`·스탬프 PDF·`customer_id` NOT NULL 등 기존 계약은 **변경 없음**

## `coordinate_pdf` vs `confirmation_only`

| 구분 | coordinate_pdf | confirmation_only (예정) |
|------|----------------|--------------------------|
| PDF 템플릿 | `pdf_template_id` 기반 필수 | 추후 PDF 없이 동작 설계 |
| 필드 정의 | PDF 엔진 `pdf_template_fields` + `contract_template_field_settings` | `contract_template_confirmation_fields` (동적) |
| 서명/좌표 | PDF 좌표에 스탬프 | 다음 단계에서 별도 정책 |

## 기존 동작 보존

- 모든 기존 템플릿은 `template_mode = 'coordinate_pdf'`로 유지된다.
- 신규 행도 기본값이 `coordinate_pdf`이므로 INSERT 경로를 바꾸지 않아도 동일하게 동작한다.
- 관리자 **템플릿 복제** 시 `template_mode`와 `contract_template_confirmation_fields` 행을 함께 복사한다(데이터 무결성).

## 추후 단계

- Admin API: `contract_template_confirmation_fields` CRUD
- 발송자: 항목 값 입력·검증
- 고객 확인 화면: `template_mode` 분기
- 확인서 PDF 생성(무좌표 전용)
- 증빙 해시·감사 로그 확장
- 외부 recipient 스냅샷 구조 검토

## 마이그레이션

- `server/initDb.js` 내 Postgres 호환 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, CHECK 재적용, 신규 `CREATE TABLE IF NOT EXISTS` 패턴을 따른다.
