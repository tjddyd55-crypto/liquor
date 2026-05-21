import type { NewsletterAttachment } from '../types'

function isFileAttachment(a: NewsletterAttachment): boolean {
  return a.kind === 'file' || a.mimeType === 'application/pdf'
}

type Props = {
  attachments: NewsletterAttachment[]
}

export function NewsletterAttachmentList({ attachments }: Props) {
  const files = attachments.filter(isFileAttachment).sort((a, b) => a.sortOrder - b.sortOrder)
  if (!files.length) {
    return null
  }

  return (
    <section aria-label="파일 첨부" style={{ marginTop: 20 }}>
      <h2 className="insurer-news-hub__section-title" style={{ fontSize: '1rem', marginBottom: 10 }}>
        파일 첨부
      </h2>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {files.map((f) => (
          <li key={f.id} style={{ marginBottom: 8 }}>
            <span aria-hidden style={{ marginRight: 6 }}>
              📎
            </span>
            <a href={f.url} download={f.fileName} target="_blank" rel="noopener noreferrer">
              {f.fileName || '파일 다운로드'}
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
