import { FormButton } from '../../../components/form'
import type { InsurerSummary } from '../types'
import { formatInsurerNewsDateTime } from '../utils/formatInsurerNewsDate'

type Props = {
  insurer: InsurerSummary
  onOpen: () => void
}

export function InsurerCard({ insurer, onOpen }: Props) {
  return (
    <FormButton htmlType="button" className="insurer-news-insurer-card" onClick={onOpen}>
      <h3 className="insurer-news-insurer-card__name">{insurer.insurerName}</h3>
      <p className="insurer-news-insurer-card__sub">
        최근 소식{' '}
        {insurer.lastPublishedAt ? formatInsurerNewsDateTime(insurer.lastPublishedAt) : '—'}
      </p>
      <p className="insurer-news-insurer-card__sub">게시 {insurer.newsletterCount}건</p>
    </FormButton>
  )
}
