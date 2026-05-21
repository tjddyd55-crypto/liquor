import { EmptyState, StatusMessage } from '../../../../../components/feedback'
import { FormButton, FormInput, FormTextarea } from '../../../../../components/form'
import GovernmentProfileProgressSummarySection from '../../../components/GovernmentProfileProgressSummarySection'
import { GOVERNMENT_PROFILE_PROGRESS_INPUT_MAX, GOVERNMENT_PROFILE_PROGRESS_TITLE_MAX } from '../../../constants/governmentProfileProgress.config'
import { progressStatusBadgeTone } from '../../../utils/governmentProfileProgressSummary'
import type { GovernmentProfileProgressViewProps } from './governmentProfileProgressViewProps'

export default function GovernmentProfileProgressPageMobile(props: GovernmentProfileProgressViewProps) {
  const {
    error,
    status,
    title,
    content,
    eventDate,
    busy,
    rows,
    summary,
    statusOptions,
    onSetStatus,
    onSetTitle,
    onSetContent,
    onSetEventDate,
    onSubmit,
    onDelete,
  } = props

  return (
    <div className="content-wrapper page-shell">
      <StatusMessage message={error} tone="error" className="!mt-0" />

      <GovernmentProfileProgressSummarySection summary={summary} />

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05rem' }}>진행 이력</h2>
        <form onSubmit={onSubmit} style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            진행 일자{' '}
            <FormInput type="date" value={eventDate} onChange={(ev) => onSetEventDate(ev.target.value)} />
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            접수 상태{' '}
            <select
              value={status}
              onChange={(e) => onSetStatus(e.target.value)}
              style={{
                width: '100%',
                background: '#020617',
                color: '#f8fafc',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: '0.5rem',
              }}
            >
              <option value="">상태 선택</option>
              {statusOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'block', marginBottom: 8 }}>
            제목 (선택){' '}
            <FormInput
              value={title}
              maxLength={GOVERNMENT_PROFILE_PROGRESS_TITLE_MAX}
              onChange={(ev) => onSetTitle(ev.target.value)}
              placeholder="진행 제목"
            />
          </label>
          <FormTextarea
            value={content}
            onChange={(ev) => onSetContent(ev.target.value)}
            rows={4}
            style={{ width: '100%', padding: 8 }}
            placeholder="처리 메모"
            maxLength={GOVERNMENT_PROFILE_PROGRESS_INPUT_MAX}
          />
          <FormButton htmlType="submit" variant="action" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? '저장 중…' : '진행 이력 추가'}
          </FormButton>
        </form>
        {rows.length === 0 ? (
          <EmptyState message="등록된 진행 이력이 없습니다." className="!my-0 !text-left" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {rows.map((r) => {
              const tone = progressStatusBadgeTone(r.status)
              return (
                <li
                  key={r.id}
                  style={{
                    borderBottom: '1px solid var(--border-default)',
                    padding: '12px 0',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      marginBottom: 6,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600 }}>{r.eventDate || r.createdAt.slice(0, 10)}</div>
                      {r.status ? (
                        <span
                          className={`government-status-summary-card__badge government-status-summary-card__badge--${tone}`}
                        >
                          {r.status}
                        </span>
                      ) : null}
                    </div>
                    <FormButton
                      htmlType="button"
                      variant="action"
                      className="filter-button"
                      disabled={busy}
                      onClick={() => void onDelete(r.id)}
                    >
                      삭제
                    </FormButton>
                  </div>
                  {r.title ? <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.title}</div> : null}
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{r.content || '—'}</div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
