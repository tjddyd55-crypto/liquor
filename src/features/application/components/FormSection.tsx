import type { PropsWithChildren } from 'react'

interface FormSectionProps extends PropsWithChildren {
  title: string
}

export function FormSection({ title, children }: FormSectionProps) {
  return (
    <section className="form-section">
      <h2 className="form-section__title">{title}</h2>
      <div className="form-grid">{children}</div>
    </section>
  )
}
