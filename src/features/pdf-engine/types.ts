/**
 * PDF 자동화 엔진 — 프론트 공용 타입.
 *
 * 서버측 `server/pdf-engine/schema/fieldSpec.js` 와 동일 형상.
 * 필드 타입을 추가할 때는 서버 스키마 + 여기 + DB CHECK 제약(initDb) 을 같이 수정한다.
 */

export const PDF_FIELD_TYPES = [
  'text',
  'textarea',
  'checkbox',
  'radio',
  'signature',
] as const
export type PdfFieldType = (typeof PDF_FIELD_TYPES)[number]

/** 관리자 좌표 에디터 드롭다운 표시용 — value 는 서버 fieldSpec 과 동일 */
export const PDF_FIELD_TYPE_LABELS: Record<PdfFieldType, string> = {
  text: '텍스트',
  textarea: '여러 줄 텍스트',
  checkbox: '체크박스',
  radio: '라디오',
  signature: '손사인',
}

/** 전자계약 PDF 필드 입력 주체(1단계). 서버 `fieldSpec.inputRole` 과 동일. */
export const PDF_INPUT_ROLES = ['customer', 'sender', 'disabled'] as const
export type PdfInputRole = (typeof PDF_INPUT_ROLES)[number]

export const PDF_INPUT_ROLE_LABELS: Record<PdfInputRole, string> = {
  customer: '고객 입력',
  sender: '설계사 발송 시 입력',
  disabled: '사용 안 함',
}

export interface PdfPlacement {
  /** 0-based 페이지 인덱스. */
  page: number
  /** PDF 포인트(원점 좌하단). */
  x: number
  y: number
  /** 텍스트 박스 너비. 있으면 줄바꿈/정렬 기준이 된다. */
  width: number | null
  /** 텍스트 박스 높이. textarea 에서 라인 초과 방지. */
  height: number | null
  /** 텍스트 크기(pt). null 이면 서버 기본값(11pt). */
  fontSize: number | null
  align: 'left' | 'center' | 'right'
  /**
   * radio 필드 전용 — 이 placement 가 대표하는 옵션 값.
   * 렌더 시 선택된 값과 일치하는 placement 만 체크 마크가 그려진다.
   * 다른 타입에서는 항상 null.
   */
  optionValue: string | null
}

export type PdfFieldDataSourceType = 'manual' | 'customer'

/** 템플릿에 저장되는 매핑 메타 — 실제 고객 값은 저장하지 않는다. */
export interface PdfFieldDataMapping {
  dataSourceType: PdfFieldDataSourceType
  customerFieldKey: string | null
  customerFieldLabel: string | null
  fallbackText: string | null
  transformType: string | null
}

export const DEFAULT_PDF_FIELD_DATA_MAPPING: PdfFieldDataMapping = {
  dataSourceType: 'manual',
  customerFieldKey: null,
  customerFieldLabel: null,
  fallbackText: null,
  transformType: null,
}

export interface PdfFieldSpec {
  fieldKey: string
  label: string
  fieldType: PdfFieldType
  required: boolean
  orderIndex: number
  /** 고객 공개 서명 단계 / 설계사 발송 전 입력 / 미사용 */
  inputRole: PdfInputRole
  /** 좌표 필드 ↔ 고객 데이터 매핑 (템플릿 저장용) */
  dataMapping: PdfFieldDataMapping
  /**
   * checkbox/radio 타입의 선택지(사용자에게 보이는 세부 라벨).
   * 다른 타입은 null.
   * UI 에서 옵션을 추가/삭제/재정렬할 수 있다.
   */
  options: string[] | null
  placements: PdfPlacement[]
}

export interface PdfTemplateSummary {
  id: number
  gaId: number | null
  gaName: string | null
  gaCode: string | null
  code: string
  title: string
  description: string
  pageCount: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface PdfTemplateDetail {
  template: PdfTemplateSummary
  fields: (PdfFieldSpec & { id: number })[]
}
