import type { ReactNode } from 'react'

type GovernmentAdminPageShellProps = {
  title: string
  description: ReactNode
  toolbar?: ReactNode
  children: ReactNode
}

/** 보험 GaManagementPage 와 동일한 page-header · toolbar · table-wrap 골격 */
export default function GovernmentAdminPageShell({
  title,
  description,
  toolbar,
  children,
}: GovernmentAdminPageShellProps) {
  return (
    <main className="page page--with-back admin-ga-management">
      <header className="page-header">
        <h1>{title}</h1>
        <p>{description}</p>
      </header>

      {toolbar ? (
        <section
          className="admin-toolbar admin-ga-management__toolbar card auth-card"
          style={{ maxWidth: 'none', margin: 0, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}
        >
          {toolbar}
        </section>
      ) : null}

      <div className="card admin-ga-management__table-wrap" style={{ maxWidth: 'none', margin: '16px 0 0', padding: 0 }}>
        {children}
      </div>
    </main>
  )
}
