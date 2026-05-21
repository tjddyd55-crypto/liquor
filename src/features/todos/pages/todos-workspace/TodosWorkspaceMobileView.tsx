import { FormButton } from '../../../../components/form'
import {
  todoPriorityLabel,
  todoSourceLabel,
  todoStatusLabel,
} from '../../utils/todoCopy'
import type { TodosWorkspaceViewProps } from './todosWorkspaceViewProps'

const CARD = 'rounded-xl border border-[#1e293b] bg-[#111827] p-3'

const FILTER_CHIP =
  'todo-filter-chip text-xs px-2 py-1 rounded-lg border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6]'
const FILTER_INACTIVE = 'todo-filter-chip--inactive border-[#334155] bg-[#020617] text-[#e5e7eb]'
const FILTER_ACTIVE =
  'todo-filter-chip--active border-[#2563eb] bg-[#2563eb] text-white shadow-[0_0_0_1px_rgba(37,99,235,0.4)]'

function filterChipClass(active: boolean): string {
  return `${FILTER_CHIP} ${active ? FILTER_ACTIVE : FILTER_INACTIVE}`
}

export default function TodosWorkspaceMobileView({
  todos,
  loading,
  error,
  quickFilter,
  setQuickFilter,
  relatedFilter,
  setRelatedFilter,
  sourceFilter,
  setSourceFilter,
  openCreateBlank,
  openEdit,
  toggleDone,
  onRelatedNavigate,
}: TodosWorkspaceViewProps) {
  return (
    <main className="page todos-page todos-page--mobile page--with-back content-wrapper page-shell bg-[#0b111a] text-[#e5e7eb] pb-6">
      <header className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div>
          <h1 className="text-lg font-semibold text-[#f8fafc] m-0">할 일</h1>
          <p className="text-xs text-[#94a3b8] m-0 mt-1">플랫폼 공통 업무 목록</p>
        </div>
        <FormButton htmlType="button" variant="primary" className="text-xs shrink-0" onClick={openCreateBlank}>
          + 추가
        </FormButton>
      </header>

      {error ? (
        <div className={`${CARD} mb-3 text-sm text-[#f87171]`} role="alert">
          {error}
        </div>
      ) : null}

      <section className={`${CARD} mb-3 space-y-2`}>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['all', '전체'],
              ['today', '오늘'],
              ['tomorrow', '내일'],
              ['week', '주'],
              ['open', '미완료'],
              ['completed', '완료'],
              ['overdue', '지남'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={filterChipClass(quickFilter === k)}
              onClick={() => setQuickFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {(
            [
              ['any', '연결전체'],
              ['yes', '연결있음'],
              ['no', '연결없음'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={filterChipClass(relatedFilter === k)}
              onClick={() => setRelatedFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-[#cbd5e1]">출처</span>
          <select
            aria-label="할 일 출처 필터"
            className={`w-full rounded-lg border text-xs py-2 px-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3b82f6] ${
              sourceFilter === 'all'
                ? 'border-[#334155] bg-[#020617] text-[#f8fafc]'
                : 'border-[#2563eb] bg-[#2563eb] text-white shadow-[0_0_0_1px_rgba(37,99,235,0.35)]'
            }`}
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">출처: 전체</option>
            <option value="manual">직접 작성</option>
            <option value="customer_memo">고객 메모</option>
            <option value="consultation_note">상담 내역</option>
            <option value="pdf_document">PDF 문서</option>
            <option value="e_document">전자문서</option>
            <option value="system">시스템</option>
          </select>
        </label>
      </section>

      {loading ? (
        <p className="text-[#94a3b8]">불러오는 중…</p>
      ) : todos.length === 0 ? (
        <p className="text-[#94a3b8]">표시할 할 일이 없습니다.</p>
      ) : (
        <ul className="m-0 p-0 list-none space-y-2">
          {todos.map((row) => (
            <li key={row.id} className={CARD}>
              <div className="flex gap-2">
                <div
                  className="shrink-0 pt-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="accent-[#2563eb] mt-0"
                    checked={row.status === 'completed'}
                    disabled={row.status === 'canceled'}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => void toggleDone(row)}
                  />
                </div>
                <div
                  className="min-w-0 flex-1 rounded-lg outline-none cursor-pointer focus-visible:ring-2 focus-visible:ring-[#3b82f6] focus-visible:ring-offset-2 focus-visible:ring-offset-[#111827]"
                  role="button"
                  tabIndex={0}
                  onClick={() => openEdit(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      openEdit(row)
                    }
                  }}
                >
                  <div className="text-left w-full text-[#60a5fa] font-semibold">{row.title}</div>
                  <div className="text-xs text-[#94a3b8] mt-1 space-y-1">
                    <div>
                      연결:{' '}
                      {row.relatedEntityType === 'customer' && row.relatedEntityId ? (
                        <button
                          type="button"
                          className="text-[#60a5fa] underline bg-transparent border-none p-0 cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            onRelatedNavigate(row)
                          }}
                        >
                          {row.customerName?.trim() ? row.customerName : `고객 #${row.relatedEntityId}`}
                        </button>
                      ) : row.relatedEntityType || row.relatedEntityId ? (
                        <span>
                          {row.relatedEntityType ?? '—'}{' '}
                          {row.relatedEntityId ? `#${row.relatedEntityId}` : ''}
                        </span>
                      ) : (
                        <span className="text-[#64748b]">연결 없음</span>
                      )}
                    </div>
                    <div>
                      마감 {row.dueDate ?? '—'}
                      {row.dueTime ? ` ${row.dueTime}` : ''} · 우선 {todoPriorityLabel(row.priority)} ·{' '}
                      {todoStatusLabel(row.status)}
                    </div>
                    <div>출처 {todoSourceLabel(row.sourceType)}</div>
                  </div>
                  {row.description ? (
                    <p className="text-xs text-[#cbd5e1] mt-2 m-0 whitespace-pre-wrap line-clamp-4">{row.description}</p>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
