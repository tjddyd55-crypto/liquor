import { getDDay, getDDayBadgeClass } from '../utils/dday'
import type { CustomerCarFormItem } from '../types/customerCarForm'

function RenewalDdayBadge({ renewalDate }: { renewalDate: string }) {
  const dday = getDDay(renewalDate)
  if (dday === null) {
    return null
  }
  return <span className={getDDayBadgeClass(dday)}>{`D-${dday}`}</span>
}

function dashOr(value: string | undefined): string {
  const t = String(value ?? '').trim()
  return t || '—'
}

export type CustomerCarReadCardProps = {
  car: CustomerCarFormItem
  index: number
}

export function CustomerCarReadCard({ car, index }: CustomerCarReadCardProps) {
  const n = index + 1
  const title = `자동차 정보 ${n}`
  return (
    <article className="customer-car-read-card">
      <div className="customer-car-read-card__header">
        <h4 className="customer-car-read-card__title">
          {car.isPrimary === true ? (
            <span className="customer-car-read-card__badge" aria-label="대표 차량">
              대표
            </span>
          ) : null}{' '}
          {title}
        </h4>
      </div>
      <div className="customer-car-read-card__row">
        <span className="customer-car-read-card__label">차량번호</span>
        <span className="customer-car-read-card__value">{dashOr(car.carNumber)}</span>
      </div>
      <div className="customer-car-read-card__row">
        <span className="customer-car-read-card__label">차종</span>
        <span className="customer-car-read-card__value">{dashOr(car.carModel)}</span>
      </div>
      <div className="customer-car-read-card__row">
        <span className="customer-car-read-card__label">연식</span>
        <span className="customer-car-read-card__value">{dashOr(car.carYear)}</span>
      </div>
      <div className="customer-car-read-card__row">
        <span className="customer-car-read-card__label">만기일</span>
        <span className="customer-car-read-card__value">
          {dashOr(car.renewalDate)}{' '}
          {car.renewalDate?.trim() ? <RenewalDdayBadge renewalDate={car.renewalDate} /> : null}
        </span>
      </div>
    </article>
  )
}
