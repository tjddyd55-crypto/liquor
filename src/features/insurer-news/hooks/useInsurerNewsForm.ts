import { useCallback, useMemo, useState } from 'react'
import type { LocalAttachmentDraft, NewsletterAttachment, NewsletterDetail } from '../types'
import { useAttachmentUploadQueue } from './useAttachmentUploadQueue'

function attachmentsToDrafts(attachments: NewsletterAttachment[]): LocalAttachmentDraft[] {
  return attachments.map((a) => ({
    localId: `existing-${a.id}`,
    file: new File([], a.fileName, {
      type: a.mimeType ?? (a.kind === 'file' ? 'application/pdf' : 'image/png'),
    }),
    kind: a.kind,
    previewUrl: a.kind === 'image' ? a.url : null,
    status: 'completed' as const,
    existingAttachmentId: a.id,
    cdnUrl: a.url,
    objectKey: a.objectKey,
    mimeType: a.mimeType,
    sizeBytes: a.size,
  }))
}

export function useInsurerNewsForm(existing: NewsletterDetail | null) {
  const [bodyText, setBodyText] = useState(existing?.bodyText ?? '')
  const queue = useAttachmentUploadQueue(
    existing?.attachments?.length ? attachmentsToDrafts(existing.attachments) : [],
  )

  const isDirty = useMemo(() => {
    if (!existing) {
      return Boolean(bodyText.trim() || queue.items.length)
    }
    if (bodyText !== existing.bodyText) {
      return true
    }
    if (queue.items.length !== existing.attachments.length) {
      return true
    }
    return false
  }, [existing, bodyText, queue.items])

  const reset = useCallback(() => {
    setBodyText(existing?.bodyText ?? '')
    queue.replaceAll(
      existing?.attachments?.length ? attachmentsToDrafts(existing.attachments) : [],
    )
  }, [existing, queue])

  return {
    bodyText,
    setBodyText,
    attachments: queue.items,
    addAttachments: queue.addFiles,
    removeAttachment: queue.remove,
    attachmentSetStatus: queue.setStatus,
    replaceAttachments: queue.replaceAll,
    isDirty,
    reset,
  }
}
