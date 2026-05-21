import type { ReactNode } from 'react'

type PageToolbarProps = {
  search?: ReactNode
  actions?: ReactNode
  status?: ReactNode
  className?: string
}

export function PageToolbar({ search, actions, status, className = '' }: PageToolbarProps) {
  return (
    <section className={['card contacts-toolbar', className].filter(Boolean).join(' ')}>
      {search ? <div>{search}</div> : null}
      {actions ? <div className="contacts-toolbar__actions">{actions}</div> : null}
      {status ? <div>{status}</div> : null}
    </section>
  )
}
