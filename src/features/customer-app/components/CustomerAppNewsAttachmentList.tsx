import { useState } from 'react'
import { resolveAbsoluteApiUrl } from '../../../lib/apiClient'
import type { CustomerAppNewsAttachment } from '../api/customerAppApi'

function formatFileSize(bytes: number | null | undefined): string {
  const n = Number(bytes ?? 0)
  if (!Number.isFinite(n) || n < 1) {
    return ''
  }
  if (n < 1024) {
    return `${n}B`
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)}KB`
  }
  return `${(n / (1024 * 1024)).toFixed(1)}MB`
}

async function fetchAttachmentBlob(url: string, appToken: string): Promise<Blob> {
  const href = resolveAbsoluteApiUrl(url)
  const hasAccessToken = href.includes('accessToken=')
  const response = await fetch(href, {
    method: 'GET',
    headers: hasAccessToken ? {} : { Authorization: `Bearer ${appToken.trim()}` },
  })
  if (!response.ok) {
    throw new Error('첨부파일을 불러오지 못했습니다.')
  }
  return response.blob()
}

type Props = {
  attachments: CustomerAppNewsAttachment[]
  appToken: string
}

export default function CustomerAppNewsAttachmentList({ attachments, appToken }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const files = [...attachments]
    .filter((row) => row.kind === 'file' || String(row.mimeType ?? '').includes('pdf'))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  if (files.length === 0) {
    return null
  }

  const runWithBlob = async (row: CustomerAppNewsAttachment, mode: 'open' | 'download') => {
    setBusyId(row.id)
    setError('')
    try {
      const sourceUrl = mode === 'download' ? row.downloadUrl ?? row.openUrl ?? row.url : row.openUrl ?? row.url
      if (!sourceUrl?.trim()) {
        throw new Error('첨부파일 주소가 없습니다.')
      }
      const blob = await fetchAttachmentBlob(sourceUrl, appToken)
      const objectUrl = URL.createObjectURL(blob)
      if (mode === 'open') {
        window.open(objectUrl, '_blank', 'noopener,noreferrer')
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
        return
      }
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = row.fileName || 'download'
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '첨부파일을 열 수 없습니다.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="customer-app-news-attachments" aria-label="첨부파일">
      <h2 className="customer-app-news-attachments__title">첨부파일</h2>
      {error ? (
        <p className="customer-app-news-attachments__error" role="alert">
          {error}
        </p>
      ) : null}
      <ul className="customer-app-news-attachments__list">
        {files.map((row) => {
          const sizeLabel = formatFileSize(row.size)
          const busy = busyId === row.id
          return (
            <li key={row.id} className="customer-app-news-attachments__item">
              <div className="customer-app-news-attachments__meta">
                <span className="customer-app-news-attachments__name">{row.fileName || '첨부파일'}</span>
                {sizeLabel ? <span className="customer-app-news-attachments__size">{sizeLabel}</span> : null}
              </div>
              <div className="customer-app-news-attachments__actions">
                <button
                  type="button"
                  className="filter-button customer-app-news-attachments__btn"
                  disabled={busy}
                  onClick={() => void runWithBlob(row, 'open')}
                >
                  {busy ? '처리 중…' : '열기'}
                </button>
                <button
                  type="button"
                  className="filter-button customer-app-news-attachments__btn"
                  disabled={busy}
                  onClick={() => void runWithBlob(row, 'download')}
                >
                  다운로드
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
