import { FormButton } from '../../../components/form'
import type { Note } from '../types/memo.types'


type Props = {
  notes: Note[]
  hiddenNotes: Record<string, boolean>
  isOpen: boolean
  onToggle: () => void
  onSelectNote: (id: string) => void
  onAutoArrange: () => void
  showToggle?: boolean
  /**
   * 헤더(제목 "메모 목록" + 정리하기 + 토글) 렌더 여부.
   *
   * 기본값은 `false`(헤더 표시) 이다. 모바일 레이아웃(`MemoPanelBody` 의
   * `memo-mobile-list` 영역) 에서는 헤더의 "메모 목록" 텍스트가 자리만 차지하고,
   * "정리하기" 는 FAB 영역으로 옮겨졌기 때문에 `hideHeader` 를 `true` 로 넘겨
   * 리스트에 사용 가능한 세로 공간을 최대로 확보한다.
   *
   * PC 우측 패널 / 기타 호출처는 기본값을 그대로 사용한다 (회귀 방지).
   */
  hideHeader?: boolean
}
export default function MemoSidebar({
  notes,
  hiddenNotes,
  isOpen,
  onToggle,
  onSelectNote,
  onAutoArrange,
  showToggle = true,
  hideHeader = false,
}: Props) {
  return (
    <div className="memo-sidebar__inner">
      {!hideHeader ? (
        <div className="memo-sidebar__header">
          <span className="memo-sidebar__title">메모 목록</span>
          <div className="memo-sidebar__header-actions">
            {isOpen ? (
              <FormButton htmlType="button" className="memo-sidebar__arrange" onClick={onAutoArrange}>
                정리하기
              </FormButton>
            ) : null}
            {showToggle ? (
              <FormButton htmlType="button" className="memo-sidebar__toggle" onClick={onToggle}>
                {isOpen ? '\u25c0' : '\u25b6'}
              </FormButton>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="memo-sidebar__list">
        {notes.map((note) => {
          const preview = note.content?.trim().slice(0, 20) || '내용 없음'
          const isExpandedOnCanvas = !hiddenNotes[note.id]
          return (
            <div
              key={note.id}
              className={`memo-list-item${isExpandedOnCanvas ? ' memo-list-item--expanded' : ''}`.trim()}
              onClick={(e) => {
                e.stopPropagation()
                onSelectNote(note.id)
              }}
            >
              {preview}
            </div>
          )
        })}
      </div>
    </div>
  )
}
