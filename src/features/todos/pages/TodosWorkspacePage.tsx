import ResponsiveLayout from '../../../components/ResponsiveLayout'
import { TodoEditorDialog } from '../components/TodoEditorDialog'
import { useTodosWorkspaceState } from '../hooks/useTodosWorkspaceState'
import TodosWorkspaceMobileView from './todos-workspace/TodosWorkspaceMobileView'
import TodosWorkspacePCView from './todos-workspace/TodosWorkspacePCView'
import type { TodosWorkspaceViewProps } from './todos-workspace/todosWorkspaceViewProps'

export default function TodosWorkspacePage() {
  const vm = useTodosWorkspaceState()

  const viewProps: TodosWorkspaceViewProps = {
    token: vm.token,
    gaId: vm.gaId,
    todos: vm.todos,
    loading: vm.loading,
    error: vm.error,
    quickFilter: vm.quickFilter,
    setQuickFilter: vm.setQuickFilter,
    relatedFilter: vm.relatedFilter,
    setRelatedFilter: vm.setRelatedFilter,
    sourceFilter: vm.sourceFilter,
    setSourceFilter: vm.setSourceFilter,
    openCreateBlank: vm.openCreateBlank,
    openEdit: vm.openEdit,
    toggleDone: vm.toggleDone,
    onRelatedNavigate: vm.onRelatedNavigate,
  }

  return (
    <>
      <ResponsiveLayout<TodosWorkspaceViewProps>
        PC={TodosWorkspacePCView}
        Mobile={TodosWorkspaceMobileView}
        viewProps={viewProps}
      />
      <TodoEditorDialog
        open={vm.editorOpen}
        onClose={() => vm.setEditorOpen(false)}
        token={vm.token}
        gaId={vm.gaId}
        sessionKey={vm.editorSession}
        editingTodo={vm.editingTodo}
        onCommitted={() => void vm.reload()}
      />
    </>
  )
}
