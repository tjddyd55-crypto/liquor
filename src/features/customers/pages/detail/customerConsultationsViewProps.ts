import type { FormEvent } from 'react'
import type { CustomerConsultationRow } from '../../api/customerExtraApi'

/**
 * `CustomerConsultationsPagePC` / `CustomerConsultationsPageMobile` 가 **공유**하는
 * View props 시그니처.
 *
 * ## 왜 공통 타입인가
 *
 * `ResponsiveLayout<ViewProps>` 는 두 View 가 동일한 props 를 받을 때만 타입 안전한
 * 분기가 가능하다 (AGENTS §8-2 원칙 1 확장 조항).
 * 시그니처가 어긋나면 container 에서 `viewProps` 를 일관되게 전달할 수 없어
 * PC/Mobile 분기마다 다른 형태의 props 를 조립하는 "결합도 증가 + 버그 온상" 이 된다.
 *
 * ## 각 핸들러·상태의 책임
 *
 *  - `error` / `body` / `consultDate` / `busy` / `rows`:
 *      container 가 보유한 단일 상태. 두 View 는 읽기만 한다.
 *  - `onSetBody` / `onSetConsultDate`:
 *      상담 작성 폼의 입력을 container 로 올려보낸다.
 *  - `onSubmit`:
 *      폼 제출(상담 등록) → container 에서 API 호출·목록 갱신.
 *  - `onDelete`:
 *      상담 삭제 → container 에서 확인 다이얼로그·API 호출·목록 갱신.
 *      PC 와 Mobile **양쪽에서 동일하게** 삭제 버튼을 노출하고 호출한다.
 *      (UX 일관성 · 일부 기기 한정으로 기능이 빠지는 상태를 만들지 않기 위함)
 */
export type CustomerConsultationsViewProps = {
  error: string
  body: string
  consultDate: string
  busy: boolean
  rows: CustomerConsultationRow[]
  onSetBody: (value: string) => void
  onSetConsultDate: (value: string) => void
  onSubmit: (e: FormEvent) => void | Promise<void>
  onDelete: (consultId: number) => void | Promise<void>
  /** 상담 본문 텍스트(parse 후)로 할 일 초안을 띄운다. */
  onAddTodoFromConsultation?: (consultId: number, plainBody: string) => void
}
