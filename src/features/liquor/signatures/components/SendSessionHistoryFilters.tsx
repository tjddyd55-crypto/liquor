import { FormButton } from '../../../../components/form'

export type HistoryFilter = 'all' | 'in_progress' | 'completed' | 'expired' | 'cancelled'

type Props = {
  value: HistoryFilter
  onChange: (v: HistoryFilter) => void
}

const OPTIONS: { value: HistoryFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'in_progress', label: '진행 중' },
  { value: 'completed', label: '완료' },
  { value: 'expired', label: '만료' },
  { value: 'cancelled', label: '취소' },
]

export function SendSessionHistoryFilters({ value, onChange }: Props) {
  return (
    <div className="contract-signature-console__filter-row" role="toolbar" aria-label="발송 상태 필터">
      {OPTIONS.map((opt) => (
        <FormButton
          key={opt.value}
          htmlType="button"
          variant="secondary"
          size="sm"
          className={`contract-signature-console__filter-btn${
            value === opt.value ? ' contract-signature-console__filter-btn--active' : ''
          }`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </FormButton>
      ))}
    </div>
  )
}
