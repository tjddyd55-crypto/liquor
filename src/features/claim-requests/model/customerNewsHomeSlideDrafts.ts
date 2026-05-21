import type { AgentCustomerNewsItem } from '../api/claimRequestsApi'
import { buildCustomerNewsGalleryUrls } from '../../customer-app/model/buildCustomerNewsGalleryUrls'
import {
  createRemoteCustomerNewsImageAttachment,
  type AllNewsAttachmentDraft,
} from './customerNewsAllAttachmentUpload'

function isImageRow(row: NonNullable<AgentCustomerNewsItem['attachments']>[0]): boolean {
  if (row.kind === 'image') {
    return true
  }
  return String(row.mimeType ?? '').toLowerCase().startsWith('image/')
}

/** 활성 고객앱 홈 세트 1건 → 편집용 이미지 draft 배열(갤러리 표시 순서와 동일) */
export function buildSlideDraftsFromActiveHomeItem(item: AgentCustomerNewsItem): AllNewsAttachmentDraft[] {
  const galleryUrls = buildCustomerNewsGalleryUrls({
    heroImageUrl: item.heroImageUrl,
    attachments: item.attachments,
  })
  const hero = String(item.heroImageUrl ?? '').trim()
  const imageRows = [...(item.attachments ?? [])].filter(isImageRow)
  const byUrl = new Map<string, (typeof imageRows)[0]>()
  for (const row of imageRows) {
    const u = String(row.url ?? '').trim()
    if (u) {
      byUrl.set(u, row)
    }
  }

  return galleryUrls.map((url, index) => {
    const row = byUrl.get(url)
    if (row) {
      return createRemoteCustomerNewsImageAttachment({
        serverKey: row.id,
        url: row.url,
        objectKey: row.objectKey,
        fileName: row.fileName || `image-${index + 1}`,
        mimeType: row.mimeType,
        size: row.size,
      })
    }
    if (url === hero) {
      return createRemoteCustomerNewsImageAttachment({
        serverKey: `hero:${index}`,
        url,
        fileName: `cover-${index + 1}.jpg`,
        mimeType: 'image/jpeg',
      })
    }
    return createRemoteCustomerNewsImageAttachment({
      serverKey: `extra:${index}:${url.slice(-32)}`,
      url,
      fileName: `image-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
    })
  })
}
