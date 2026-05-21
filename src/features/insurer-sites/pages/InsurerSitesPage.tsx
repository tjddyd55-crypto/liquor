import { useCallback, useEffect, useState } from 'react'
import { FormButton } from '../../../components/form'
import { useAuth } from '../../auth/AuthProvider'
import type { InsurerSite, InsurerSiteCategory } from '../api/insurerSitesApi'
import { fetchActiveInsurerSites } from '../api/insurerSitesApi'
import { InsurerSiteLogoMark } from '../components/InsurerSiteLogoMark'
import { safeOpenUrl } from '../lib/insurerSiteLinks'
import '../insurer-sites.css'

function FooterLink(props: {
  label: string
  url: string
  onStop: (e: React.MouseEvent) => void
}) {
  const has = Boolean(String(props.url ?? '').trim())
  return (
    <FormButton
      htmlType="button"
      variant="action"
      disabled={!has}
      onClick={(e) => {
        props.onStop(e)
        if (has) safeOpenUrl(props.url)
      }}
      style={{
        flex: 1,
        minWidth: 0,
        fontSize: 11,
        padding: '6px 4px',
        fontWeight: 600,
        ...(has
          ? {}
          : {
              background: 'color-mix(in srgb, var(--text-secondary) 8%, transparent)',
              color: 'var(--text-secondary)',
            }),
      }}
    >
      {has ? props.label : `${props.label} · 준비중`}
    </FormButton>
  )
}

export default function InsurerSitesPage() {
  const { token } = useAuth()
  const [tab, setTab] = useState<InsurerSiteCategory>('non_life')
  const [items, setItems] = useState<InsurerSite[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!token?.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await fetchActiveInsurerSites(token, tab)
      setItems(Array.isArray(res.items) ? res.items : [])
    } catch (e) {
      setItems([])
      setError(e instanceof Error ? e.message : '목록을 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [token, tab])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <main className="page page--with-back">
      <header className="page-header">
        <h1>보험사 설계사이트</h1>
        <p>설계사이트·공식홈·공시실·보상홈으로 바로 이동합니다.</p>
      </header>

      <div
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 12,
          borderRadius: 10,
          overflow: 'hidden',
          border: '1px solid color-mix(in srgb, var(--border) 85%, transparent)',
        }}
      >
        {(
          [
            { id: 'non_life' as const, label: '손해보험사' },
            { id: 'life' as const, label: '생명보험사' },
          ] as const
        ).map((t) => {
          const active = tab === t.id
          return (
            <FormButton
              key={t.id}
              htmlType="button"
              variant={active ? 'primary' : 'secondary'}
              onClick={() => setTab(t.id)}
              style={{
                flex: 1,
                borderRadius: 0,
                border: 'none',
                boxShadow: active ? 'inset 0 -3px 0 var(--primary)' : 'none',
                background: active
                  ? 'color-mix(in srgb, var(--primary) 18%, var(--surface))'
                  : 'var(--surface)',
                color: active ? 'var(--primary)' : 'var(--text-secondary)',
              }}
            >
              {t.label}
            </FormButton>
          )
        })}
      </div>

      {error ? (
        <p className="text-error" style={{ margin: '0 0 12px' }}>
          {error}
        </p>
      ) : null}
      {loading ? <p style={{ margin: 0 }}>불러오는 중…</p> : null}

      {!loading && !error && items.length === 0 ? (
        <p style={{ margin: 0, color: 'var(--text-secondary)' }}>표시할 보험사가 없습니다.</p>
      ) : null}

      <div className="insurer-sites-grid">
        {items.map((site) => {
          const sales = String(site.salesUrl ?? '').trim()
          return (
            <article
              key={site.id}
              style={{
                border: '1px solid color-mix(in srgb, var(--border) 90%, transparent)',
                borderRadius: 10,
                padding: '10px 8px 8px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                background: 'var(--surface)',
                minHeight: 210,
              }}
            >
              <div
                role={sales ? 'button' : undefined}
                tabIndex={sales ? 0 : undefined}
                onClick={() => safeOpenUrl(site.salesUrl)}
                onKeyDown={(e) => {
                  if (!sales) return
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    safeOpenUrl(site.salesUrl)
                  }
                }}
                style={{
                  cursor: sales ? 'pointer' : 'default',
                  textAlign: 'center',
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <InsurerSiteLogoMark key={site.id} name={site.name} logoPath={site.logoPath} variant="userCard" />
                <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{site.name}</div>
                <FormButton
                  htmlType="button"
                  variant="primary"
                  disabled={!sales}
                  onClick={(e) => {
                    e.stopPropagation()
                    safeOpenUrl(site.salesUrl)
                  }}
                  style={{
                    margin: '0 auto',
                    fontSize: 12,
                    padding: '6px 12px',
                  }}
                >
                  설계사이트
                </FormButton>
              </div>
              <div
                style={{ display: 'flex', gap: 4 }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <FooterLink label="공식홈" url={site.homepageUrl} onStop={(e) => e.stopPropagation()} />
                <FooterLink label="공시실" url={site.disclosureUrl} onStop={(e) => e.stopPropagation()} />
                <FooterLink label="보상홈" url={site.claimUrl} onStop={(e) => e.stopPropagation()} />
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
