import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FormButton } from '../../../components/form'

function readLinkCode(searchParams: URLSearchParams): string {
  const raw = String(searchParams.get('code') ?? searchParams.get('token') ?? '').trim()
  return raw.toUpperCase()
}

/**
 * 고객앱 연결용 https 진입점 — 문자/카카오 등에서 열리면 웹 연결 화면으로만 이동한다.
 * (네이티브 앱 딥링크·APK 설치 유도는 고객 노출 UI에서 제외)
 */
export default function CustomerAppLinkOpenPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const code = useMemo(() => readLinkCode(searchParams), [searchParams])

  useEffect(() => {
    if (!code) {
      return
    }
    navigate(`/customer-app/connect/${encodeURIComponent(code)}`, { replace: true })
  }, [code, navigate])

  if (!code) {
    return (
      <main className="content-wrapper py-6 max-w-xl">
        <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 space-y-3">
          <h1 className="text-lg font-semibold">연결 링크</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            링크에 연결 코드가 없습니다. 설계사가 보낸 연결 링크를 눌러 주시거나, 담당자에게 새 링크를 요청해 주세요.
          </p>
          <FormButton htmlType="button" variant="secondary" onClick={() => navigate('/customer-app', { replace: true })}>
            고객 앱으로
          </FormButton>
        </section>
      </main>
    )
  }

  return (
    <main className="content-wrapper py-6 max-w-xl">
      <section className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] p-4 space-y-3">
        <h1 className="text-lg font-semibold">연결 준비</h1>
        <p className="text-sm text-[var(--text-secondary)] m-0">연결 화면으로 이동하는 중…</p>
      </section>
    </main>
  )
}
