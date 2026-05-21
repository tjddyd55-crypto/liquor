import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthProvider'
import { InsurerNewsForm } from '../components/InsurerNewsForm'
import { createManagerNewsletter, resolveInsurerManagerPublishContext } from '../services/insurerNews.service'
import type { NewsChannel } from '../types'

export function InsurerManagerNewsUploadPage({
  channel = 'INSURER',
  title = '원수사 소식지 업로드',
  subtitle = '등록된 내용은 GA 소속 사용자에게 공개될 수 있습니다.',
  listPath = '/insurer/news',
  noSessionMessage = '원수사 담당자 계정으로 로그인한 후 이용할 수 있습니다.',
}: {
  channel?: NewsChannel
  title?: string
  subtitle?: string
  listPath?: string
  noSessionMessage?: string
}) {
  const { user, token } = useAuth()
  const navigate = useNavigate()
  const gaCode = user?.gaCode ?? ''
  const companyId = user?.companyId
  const requiresCompanyScope = channel !== 'LOSS_ADJUSTER'
  const [error, setError] = useState('')
  const [context, setContext] = useState<{
    gaCode: string
    insurerCode: string
    insurerName: string
    insurerSlug: string
  } | null>(null)

  useEffect(() => {
    if (!token?.trim() || !gaCode || (requiresCompanyScope && companyId == null)) {
      return
    }
    let cancelled = false
    ;(async () => {
      const resolved = await resolveInsurerManagerPublishContext(token, gaCode, companyId ?? 0, { channel })
      if (cancelled) {
        return
      }
      if ('error' in resolved) {
        setError(resolved.error)
        setContext(null)
      } else {
        setError('')
        setContext(resolved)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [channel, token, gaCode, companyId, requiresCompanyScope])

  if (!gaCode || (requiresCompanyScope && companyId == null)) {
    return (
      <main className="page page--with-back insurer-news-page">
        <div className="insurer-news-empty">{noSessionMessage}</div>
      </main>
    )
  }

  if (error) {
    return (
      <main className="page page--with-back insurer-news-page">
        <div className="insurer-news-empty">{error}</div>
      </main>
    )
  }

  if (!context) {
    return (
      <main className="page page--with-back insurer-news-page">
        <div className="insurer-news-empty">불러오는 중…</div>
      </main>
    )
  }

  return (
    <main className="page page--with-back insurer-news-page">
      <header className="page-header" style={{ marginBottom: 16 }}>
        <h1 style={{ marginBottom: 8 }}>{title}</h1>
        <p className="insurer-news-muted">{subtitle}</p>
      </header>
      <InsurerNewsForm
        mode="create"
        initial={null}
        context={context}
        authToken={token}
        channel={channel}
        onCancel={() => navigate(listPath)}
        onSubmit={async (draft) => {
          await createManagerNewsletter(token!, draft, { channel })
          navigate(listPath)
        }}
      />
    </main>
  )
}
