import MemoWorkspacePage from '../features/memo/pages/MemoWorkspacePage'
import MemoList from '../features/memo/components/MemoList'
import { FormButton } from '../components/form'

export type MemoPanelProps = {
  isFullscreen: boolean
  isListOpen: boolean
  onToggleList: () => void
  selectedNoteId: string | null
  onSelectNoteFromList: (id: string) => void
  showListToggle?: boolean
}

/**
 * PC 우측 고정 패널 전용 — MemoWorkspaceProvider 하위에서만 사용합니다.
 */
export default function MemoPanel({
  isFullscreen,
  isListOpen,
  onToggleList,
  selectedNoteId,
  onSelectNoteFromList,
  showListToggle = true,
}: MemoPanelProps) {
  const listVisible = isListOpen

  return (
    <div className={`memo-panel ${isFullscreen ? 'memo-panel--fullscreen' : ''}`}>
      <div className="memo-panel-main">
        <div className="memo-body memo-body--pc-panel memo-body--list-row">
          <div className="memo-canvas-area memo-canvas-area--pc">
            <MemoWorkspacePage />
          </div>
          {listVisible ? (
            <div
              className="memo-list-sidebar memo-list-sidebar--right-dock"
              data-selected-note={selectedNoteId ?? ''}
            >
              {showListToggle ? (
                <FormButton
                  htmlType="button"
                  variant="action"
                  className="memo-list-toggle-btn memo-list-toggle-btn--collapse"
                  onClick={onToggleList}
                  aria-label="메모 목록 접기"
                >
                  &gt;
                </FormButton>
              ) : null}
              <MemoList onAfterSelectNote={onSelectNoteFromList} />
            </div>
          ) : null}
          {!listVisible && showListToggle ? (
            <FormButton
              htmlType="button"
              variant="action"
              className="memo-list-toggle-btn memo-list-toggle-btn--expand"
              onClick={onToggleList}
              aria-label="메모 목록 열기"
            >
              &lt;
            </FormButton>
          ) : null}
        </div>
      </div>
    </div>
  )
}
