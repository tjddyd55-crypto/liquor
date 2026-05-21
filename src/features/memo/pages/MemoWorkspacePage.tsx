import StickyNote from '../components/StickyNote'
import DeleteConfirmModal, {
  MemoDeleteConfirmFooter,
} from '../components/DeleteConfirmModal'
import { useMemoWorkspace } from '../context/MemoWorkspaceContext'

export default function MemoWorkspacePage() {
  const {
    token,
    notes,
    notesLoading,
    updateNote,
    updatePosition,
    updateSize,
    updateFontSize,
    workspaceRef,
    containerRef,
    activeNoteId,
    editingNoteId,
    draggingNoteId,
    pendingDeleteId,
    deleteSubmitting,
    canvasHeight,
    getWorkspaceBounds,
    handleRootClick,
    handleActivate,
    handleTextareaFocus,
    handleTextareaBlur,
    handleDragStart,
    handleDragEnd,
    handleRequestDelete,
    handleCanvasClick,
    closeDeleteModal,
    confirmDelete,
    hiddenNotes,
    minimizeNote,
  } = useMemoWorkspace()

  if (!token?.trim()) {
    return (
      <div className="p-4">
        <h1 className="text-lg font-bold">메모 워크스페이스</h1>
        <p className="text-sm text-gray-400 mt-2">로그인이 필요합니다.</p>
      </div>
    )
  }

  const visibleNotes = notes.filter((n) => !hiddenNotes[n.id])

  return (
    <>
      <div
        className="memo-canvas"
        style={canvasHeight != null ? { minHeight: canvasHeight } : undefined}
        onClick={handleCanvasClick}
      >
        <div
          ref={workspaceRef}
          className="memo-workspace memo-workspace--infinite w-full h-full min-h-full bg-transparent"
          onClick={handleCanvasClick}
        >
          <div ref={containerRef} className="h-full w-full" onClick={handleCanvasClick}>
            {/*
             * 색상 클래스를 컴포넌트 레벨에 박지 않는다. 메모 캔버스는 앱 전역 테마와
             * 독립된 "다크 스코프" 라서, 색은 부모 .memo-canvas-area 의 전용 변수
             * (--canvas-fg / --canvas-fg-muted) 에서 상속받는다. (index.css 참조)
             *
             * 역사적 회귀: 예전에는 text-[var(--text-primary)] 를 직접 썼는데, 라이트
             * 테마에서 --text-primary=#111 이 되어 검은 배경 + 검은 글씨로 본문이
             * 안 보이는 증상이 있었다. 컴포넌트에서 색을 지우고 CSS scope 에 위임한다.
             */}
            {notesLoading && notes.length === 0 ? (
              <div className="memo-workspace__loading flex items-center justify-center px-4 py-16 text-sm">
                메모를 불러오는 중…
              </div>
            ) : notes.length === 0 ? (
              <div className="memo-workspace__empty">
                <p className="memo-workspace__empty-title">메모가 아직 없습니다</p>
                <p className="memo-workspace__empty-hint">
                  우측 하단 + 버튼으로 첫 메모를 만들어보세요
                </p>
              </div>
            ) : visibleNotes.length === 0 ? (
              <div className="memo-workspace__empty">
                <p className="memo-workspace__empty-title">캔버스에 표시된 메모가 없습니다</p>
                <p className="memo-workspace__empty-hint">
                  우측 목록에서 메모를 선택하면 다시 표시됩니다.
                </p>
              </div>
            ) : (
              visibleNotes.map((note) => (
                <StickyNote
                  key={note.id}
                  note={note}
                  isActive={activeNoteId === note.id}
                  isEditing={editingNoteId === note.id}
                  isDragging={draggingNoteId === note.id}
                  onChange={(content) => updateNote(note.id, content)}
                  onPositionChange={updatePosition}
                  onSizeChange={updateSize}
                  onFontSizeChange={updateFontSize}
                  containerRef={containerRef}
                  getWorkspaceBounds={getWorkspaceBounds}
                  onDeleteRequest={handleRequestDelete}
                  onRootClick={handleRootClick}
                  onActivate={handleActivate}
                  onTextareaFocus={handleTextareaFocus}
                  onTextareaBlur={handleTextareaBlur}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onMinimize={minimizeNote}
                />
              ))
            )}
          </div>
        </div>
      </div>

      <DeleteConfirmModal
        open={!!pendingDeleteId}
        onClose={closeDeleteModal}
        title="메모 삭제"
        footer={
          <MemoDeleteConfirmFooter
            onCancel={closeDeleteModal}
            onConfirm={() => void confirmDelete()}
            submitting={deleteSubmitting}
          />
        }
      >
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          이 메모를 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.
        </p>
      </DeleteConfirmModal>
    </>
  )
}
