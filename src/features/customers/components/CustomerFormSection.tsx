import type { ReactNode } from 'react'

export type CustomerFormSectionProps = {
  title: string
  description?: string
  /** 제목 옆 액션(예: 자동차 추가 버튼) */
  headerExtra?: ReactNode
  children: ReactNode
  className?: string
}

export function CustomerFormSection({
  title,
  description,
  headerExtra,
  children,
  className,
}: CustomerFormSectionProps) {
  return (
    <section className={`customer-form-section${className ? ` ${className}` : ''}`}>
      <div className="customer-form-section__header">
        <div className="customer-form-section__title-row">
          <h3 className="customer-form-section__title">{title}</h3>
          {headerExtra ? (
            <div className="customer-form-section__header-extra">{headerExtra}</div>
          ) : null}
        </div>
        {description ? (
          <p className="customer-form-section__description">{description}</p>
        ) : null}
      </div>
      <div className="customer-form-section__body">{children}</div>
    </section>
  )
}
