import { EmptyState, StatusMessage } from '../../../../components/feedback'
import { FormButton, FormInput, FormTextarea } from '../../../../components/form'
import { parseConsultationStoredBody } from '../../utils/consultationBodyFormat'
import type { CustomerConsultationsViewProps } from './customerConsultationsViewProps'

export default function CustomerConsultationsPageMobile({
  error,
  body,
  consultDate,
  busy,
  rows,
  onSetBody,
  onSetConsultDate,
  onSubmit,
  onDelete,
  onAddTodoFromConsultation,
}: CustomerConsultationsViewProps) {
  return (
    <div className="content-wrapper page-shell">
      <StatusMessage message={error} tone="error" className="!mt-0" />

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: '1.05rem' }}>상담 기록</h2>
        <form onSubmit={onSubmit} style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 8 }}>
            상담 일자{' '}
            <FormInput type="date" value={consultDate} onChange={(ev) => onSetConsultDate(ev.target.value)} />
          </label>
          <FormTextarea
            value={body}
            onChange={(ev) => onSetBody(ev.target.value)}
            rows={4}
            style={{ width: '100%', padding: 8 }}
            placeholder="상담 내용"
            maxLength={19500}
          />
          <FormButton htmlType="submit" variant="action" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? '저장 중…' : '상담 추가'}
          </FormButton>
        </form>
        {rows.length === 0 ? (
          <EmptyState message="등록된 상담이 없습니다." className="!my-0 !text-left" />
        ) : (
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {rows.map((r) => {
              const { dateLabel, text } = parseConsultationStoredBody(
                r.body,
                r.createdAt,
                r.consultationDate ?? null,
              )
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
                    <div style={{ fontWeight: 600 }}>{dateLabel}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <FormButton
                        htmlType="button"
                        variant="action"
                        className="filter-button"
                        disabled={busy}
                        onClick={() => void onDelete(r.id)}
                      >
                        삭제
                      </FormButton>
                      {onAddTodoFromConsultation ? (
                        <FormButton
                          htmlType="button"
                          variant="secondary"
                          className="filter-button"
                          disabled={busy}
                          onClick={() => onAddTodoFromConsultation(r.id, text)}
                        >
                          할 일로 추가
                        </FormButton>
                      ) : null}
                    </div>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', marginTop: 6 }}>{text || '—'}</div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
