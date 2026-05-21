import { useMemo } from 'react'
import { sanitizeRichTextHtml } from './richText'

type RichTextContentProps = {
  value: string
  className?: string
  emptyText?: string
}

export default function RichTextContent({ value, className = '', emptyText = '' }: RichTextContentProps) {
  const html = useMemo(() => sanitizeRichTextHtml(value), [value])

  if (!html && emptyText) {
    return <div className={className}>{emptyText}</div>
  }

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
