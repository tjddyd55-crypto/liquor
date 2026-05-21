import { Link } from 'react-router-dom'
import '../government-support.css'

type Props = {
  title: string
  description?: string
  backTo?: string
}

export default function GovernmentPlaceholderPage({ title, description, backTo = '/government/workspace' }: Props) {
  return (
    <main className="page government-page government-page--gate">
      <h1 className="government-page__title">{title}</h1>
      {description ? <p className="government-page__muted">{description}</p> : null}
      <p style={{ marginTop: '1rem' }}>
        <Link to={backTo} className="dark-link">
          워크스페이스로
        </Link>
      </p>
    </main>
  )
}
