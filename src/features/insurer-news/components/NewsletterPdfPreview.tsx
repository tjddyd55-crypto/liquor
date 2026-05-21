type Props = {
  fileName: string
  /** TODO(insurer-news): 실제 다운로드 URL */
  href?: string
}

export function NewsletterPdfPreview({ fileName, href }: Props) {
  const hasLink = Boolean(href && href !== '#')

  return (
    <div className="insurer-news-pdf-preview">
      <span className="insurer-news-pdf-preview__icon" aria-hidden>
        PDF
      </span>
      <div style={{ minWidth: 0 }}>
        <div className="insurer-news-pdf-preview__name">{fileName}</div>
        {hasLink ? (
          <a href={href} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13 }}>
            새 탭에서 열기
          </a>
        ) : (
          <span className="insurer-news-muted" style={{ fontSize: 12 }}>
            {/* TODO(insurer-news): 서명 URL 연결 */}
            연결 준비 중
          </span>
        )}
      </div>
    </div>
  )
}
