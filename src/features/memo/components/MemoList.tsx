import MemoSidebar from './MemoSidebar'
import { useMemoWorkspace } from '../context/MemoWorkspaceContext'

type Props = {
  /** 리스트에서 노트 선택 후 추가 동작(모바일 selectedNoteId 등) */
  onAfterSelectNote?: (id: string) => void
  /**
   * 하위 `MemoSidebar` 의 헤더("메모 목록" 제목 + 정리하기 + 토글)를 숨긴다.
   * 모바일 하단 메모 리스트 영역이 세로 공간을 최대한 리스트에 할애하기 위한 옵션.
   * 기본값은 `false` (헤더 표시) — PC 우측 패널 등 호출처 회귀 방지.
   */
  hideHeader?: boolean
}

/**
 * MemoSidebar 기반 목록 — 레이아웃 우측 탐색용
 */
export default function MemoList({ onAfterSelectNote, hideHeader = false }: Props) {
  const {
    token,
    notes,
    hiddenNotes,
    handleSidebarSelectNote,
    handleAutoArrange,
    setIsMinimized,
    restoreNote,
  } = useMemoWorkspace()

  if (!token?.trim()) {
    return null
  }

  const onSelect = (id: string) => {
    setIsMinimized(false)
    restoreNote(id)
    handleSidebarSelectNote(id)
    onAfterSelectNote?.(id)
  }

  return (
    <MemoSidebar
      notes={notes}
      hiddenNotes={hiddenNotes}
      isOpen
      onToggle={() => {}}
      onSelectNote={onSelect}
      onAutoArrange={handleAutoArrange}
      showToggle={false}
      hideHeader={hideHeader}
    />
  )
}
