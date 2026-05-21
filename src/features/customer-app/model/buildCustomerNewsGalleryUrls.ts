export type NewsAttachmentLike = {
  kind: string
  url: string
  sortOrder: number
  mimeType?: string
}

function isImageAttachment(row: NewsAttachmentLike): boolean {
  if (row.kind === 'image') {
    return true
  }
  const mime = String(row.mimeType ?? '').toLowerCase()
  return mime.startsWith('image/')
}

/**
 * 고객 소식지 상세·목록에서 쓸 이미지 URL 목록.
 * attachments 순서(sortOrder)를 유지하고, hero는 목록에 없을 때만 맨 앞에 붙인다.
 * 동일 URL은 한 번만 포함한다.
 */
export function buildCustomerNewsGalleryUrls(params: {
  heroImageUrl?: string | null
  attachments?: NewsAttachmentLike[] | null
}): string[] {
  const hero = String(params.heroImageUrl ?? '').trim()
  const rows = [...(params.attachments ?? [])]
    .filter(isImageAttachment)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const fromAttachments = rows.map((row) => String(row.url ?? '').trim()).filter(Boolean)

  const out: string[] = []
  const seen = new Set<string>()
  const push = (url: string) => {
    if (!url || seen.has(url)) {
      return
    }
    seen.add(url)
    out.push(url)
  }

  if (hero && !fromAttachments.includes(hero)) {
    push(hero)
  }
  for (const url of fromAttachments) {
    push(url)
  }

  if (out.length === 0 && hero) {
    push(hero)
  }

  return out
}
