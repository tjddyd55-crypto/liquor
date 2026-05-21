import { apiRequest, resolveApiUrl } from '../../../lib/apiClient'
import { listCompanyDirectory } from '../../company-registry/api/companyRegistryApi'
import { isNewsletterInCompanyScope } from '../lib/insurerNewsCompanyScope'
import { cdnUrlForObjectKey } from '../lib/insurerNewsCdn'
import { validateInsurerNewsFile } from '../utils/validateInsurerNewsFile'
import type { InsurerSummary, LocalAttachmentDraft, NewsChannel, NewsletterDetail, NewsletterItem } from '../types'

type PublishContextApi = {
  gaCode: string
  insurerCode: string
  insurerName: string
  insurerSlug: string
  newsChannel?: NewsChannel
}

const DEFAULT_NEWS_CHANNEL: NewsChannel = 'INSURER'

function normalizeChannel(channel?: NewsChannel): NewsChannel {
  return channel === 'LOSS_ADJUSTER' ? 'LOSS_ADJUSTER' : DEFAULT_NEWS_CHANNEL
}

function sortByPublishedDesc(items: NewsletterItem[]): NewsletterItem[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.publishedAt).getTime()
    const tb = new Date(b.publishedAt).getTime()
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0)
  })
}

export type InsurerNewsFeedResponse = {
  newsletters: NewsletterItem[]
  insurers: InsurerSummary[]
}

async function fetchPublishContextApi(token: string, options?: { channel?: NewsChannel }): Promise<PublishContextApi> {
  const channel = normalizeChannel(options?.channel)
  const q = channel === DEFAULT_NEWS_CHANNEL ? '' : `?channel=${encodeURIComponent(channel)}`
  return apiRequest<PublishContextApi>(`/api/insurer-news/manager/publish-context${q}`, { token })
}

async function fetchInsurerNewsFeed(
  gaCode: string,
  token: string,
  opts?: { limit?: number; insurerSlug?: string; channel?: NewsChannel },
): Promise<InsurerNewsFeedResponse> {
  const channel = normalizeChannel(opts?.channel)
  const limit = opts?.limit ?? 500
  const sp = new URLSearchParams({
    gaCode: gaCode.trim(),
    limit: String(limit),
    channel,
  })
  if (opts?.insurerSlug?.trim()) {
    sp.set('insurerSlug', opts.insurerSlug.trim().toLowerCase())
  }
  try {
    const payload = await apiRequest<InsurerNewsFeedResponse | unknown[]>(
      `/api/insurer-news/feed?${sp}`,
      { token },
    )
    if (Array.isArray(payload)) {
      return { newsletters: [], insurers: [] }
    }
    return payload as InsurerNewsFeedResponse
  } catch {
    return { newsletters: [], insurers: [] }
  }
}

export async function getRecentNewslettersByGa(
  gaCode: string,
  limit = 8,
  token?: string | null,
  options?: { channel?: NewsChannel },
): Promise<NewsletterItem[]> {
  if (!token?.trim()) {
    return []
  }
  const { newsletters } = await fetchInsurerNewsFeed(gaCode, token, {
    limit: Math.max(limit, 50),
    channel: options?.channel,
  })
  return sortByPublishedDesc(newsletters).slice(0, limit)
}

export async function getNewslettersByInsurer(
  gaCode: string,
  insurerSlug: string,
  token?: string | null,
  options?: { channel?: NewsChannel },
): Promise<NewsletterItem[]> {
  if (!token?.trim()) {
    return []
  }
  const { newsletters } = await fetchInsurerNewsFeed(gaCode, token, {
    insurerSlug: insurerSlug.trim().toLowerCase(),
    limit: 500,
    channel: options?.channel,
  })
  return sortByPublishedDesc(newsletters)
}

export async function getNewsletterDetail(
  gaCode: string,
  newsletterId: string,
  token?: string | null,
  options?: { channel?: NewsChannel },
): Promise<NewsletterDetail | null> {
  if (!token?.trim()) {
    return null
  }
  const q = new URLSearchParams({ gaCode, channel: normalizeChannel(options?.channel) })
  try {
    return await apiRequest<NewsletterDetail>(`/api/insurer-news/feed/${encodeURIComponent(newsletterId)}?${q}`, {
      token,
    })
  } catch {
    return null
  }
}

export async function getInsurersForGa(
  gaCode: string,
  token?: string | null,
  options?: { channel?: NewsChannel },
): Promise<InsurerSummary[]> {
  if (!token?.trim()) {
    return []
  }
  const { insurers } = await fetchInsurerNewsFeed(gaCode, token, { limit: 1, channel: options?.channel })
  return [...insurers].sort((a, b) => a.insurerName.localeCompare(b.insurerName, 'ko'))
}

export async function getAllPublishedForGa(
  gaCode: string,
  token?: string | null,
  options?: { channel?: NewsChannel },
): Promise<NewsletterItem[]> {
  if (!token?.trim()) {
    return []
  }
  const { newsletters } = await fetchInsurerNewsFeed(gaCode, token, { limit: 500, channel: options?.channel })
  return sortByPublishedDesc(newsletters)
}

/**
 * @param presignInsurerCode GA 스태프 등 세션 외 원수사 지정이 필요할 때 presign body에 포함
 */
export async function uploadNewsletterAttachments(
  token: string,
  drafts: LocalAttachmentDraft[],
  options?: { presignInsurerCode?: string; channel?: NewsChannel },
): Promise<LocalAttachmentDraft[]> {
  const presignInsurerCode = options?.presignInsurerCode?.trim()
  const channel = normalizeChannel(options?.channel)
  const out: LocalAttachmentDraft[] = []
  for (const item of drafts) {
    if (item.status === 'failed') {
      out.push(item)
      continue
    }
    if (item.cdnUrl && item.objectKey) {
      out.push({ ...item, status: 'completed' })
      continue
    }
    if (item.file.size === 0 && item.existingAttachmentId) {
      if (!item.cdnUrl || !item.objectKey) {
        out.push({
          ...item,
          status: 'failed',
          errorMessage: '기존 첨부 메타가 없습니다. 페이지를 새로고침 후 다시 시도해 주세요.',
        })
        continue
      }
      out.push(item)
      continue
    }

    const v = validateInsurerNewsFile(item.file)
    if (!v.ok) {
      out.push({ ...item, status: 'failed', errorMessage: v.message })
      continue
    }

    const contentType = item.file.type || (v.kind === 'file' ? 'application/pdf' : 'image/jpeg')
    try {
      const presignBody: Record<string, unknown> = {
        fileName: item.file.name || 'file',
        contentType,
        sizeBytes: item.file.size,
      }
      if (presignInsurerCode) {
        presignBody.insurerCode = presignInsurerCode
      }
      presignBody.channel = channel
      const presign = await apiRequest<{
        uploadUrl: string
        objectKey: string
        putHeaders?: Record<string, string>
      }>('/api/insurer-news/attachments/presign', {
        method: 'POST',
        token,
        body: JSON.stringify(presignBody),
      })

      const putHeaders: Record<string, string> = {
        'Content-Type': contentType,
        ...(presign.putHeaders ?? {}),
      }

      let putOk = false
      try {
        const put = await fetch(presign.uploadUrl, {
          method: 'PUT',
          headers: putHeaders,
          body: item.file,
        })
        putOk = put.ok
        if (!put.ok) {
          console.warn(
            '[upload-fail]',
            JSON.stringify({
              stage: 'r2-put',
              objectKey: presign.objectKey,
              status: put.status,
              at: new Date().toISOString(),
            }),
          )
        }
      } catch (putErr) {
        console.warn(
          '[upload-fail]',
          JSON.stringify({
            stage: 'r2-put',
            objectKey: presign.objectKey,
            message: putErr instanceof Error ? putErr.message : String(putErr),
            at: new Date().toISOString(),
          }),
        )
      }

      if (!putOk) {
        // R2 브라우저 CORS 차단 시 서버 경유 fallback
        const q = new URLSearchParams({
          objectKey: presign.objectKey,
          channel,
          contentType,
        })
        if (presignInsurerCode) {
          q.set('insurerCode', presignInsurerCode)
        }
        const proxyResp = await fetch(resolveApiUrl(`/api/insurer-news/attachments/upload-proxy?${q}`), {
          method: 'PUT',
          headers: {
            'Content-Type': contentType,
            Authorization: `Bearer ${token}`,
          },
          body: item.file,
        })
        if (!proxyResp.ok) {
          const msg = `업로드 실패 (${proxyResp.status})`
          out.push({ ...item, status: 'failed', errorMessage: msg })
          continue
        }
      }

      try {
        const completeBody: Record<string, unknown> = {
          objectKey: presign.objectKey,
          byteSize: item.file.size,
          contentType,
        }
        if (presignInsurerCode) {
          completeBody.insurerCode = presignInsurerCode
        }
        completeBody.channel = channel
        await apiRequest<void>('/api/insurer-news/attachments/upload-complete', {
          method: 'POST',
          token,
          body: JSON.stringify(completeBody),
        })
      } catch (completeErr) {
        console.warn(
          '[upload-complete-fail]',
          JSON.stringify({
            objectKey: presign.objectKey,
            message: completeErr instanceof Error ? completeErr.message : String(completeErr),
            at: new Date().toISOString(),
          }),
        )
      }

      const url = cdnUrlForObjectKey(presign.objectKey)
      out.push({
        ...item,
        status: 'completed',
        cdnUrl: url,
        objectKey: presign.objectKey,
        mimeType: contentType,
        sizeBytes: item.file.size,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '업로드에 실패했습니다.'
      console.error(
        '[upload-fail]',
        JSON.stringify({ stage: 'presign-or-network', message: msg, at: new Date().toISOString() }),
      )
      out.push({ ...item, status: 'failed', errorMessage: msg })
    }
  }
  return out
}

export async function createManagerNewsletter(
  token: string,
  draft: NewsletterDetail,
  options?: { channel?: NewsChannel },
): Promise<NewsletterDetail> {
  return apiRequest<NewsletterDetail>('/api/insurer-news/manager/newsletters', {
    method: 'POST',
    token,
    body: JSON.stringify({
      bodyText: draft.bodyText,
      status: draft.status,
      gaCode: draft.gaCode,
      insurerCode: draft.insurerCode,
      insurerSlug: draft.insurerSlug,
      insurerName: draft.insurerName,
      channel: normalizeChannel(options?.channel),
      summary: draft.summary,
      publishedAt: draft.publishedAt,
      attachments: draft.attachments.map((a) => ({
        kind: a.kind,
        url: a.url,
        objectKey: a.objectKey,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        sortOrder: a.sortOrder,
      })),
    }),
  })
}

export async function updateManagerNewsletter(
  token: string,
  newsletterId: string,
  draft: NewsletterDetail,
  options?: { channel?: NewsChannel },
): Promise<NewsletterDetail> {
  return apiRequest<NewsletterDetail>(`/api/insurer-news/manager/newsletters/${encodeURIComponent(newsletterId)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({
      bodyText: draft.bodyText,
      status: draft.status,
      gaCode: draft.gaCode,
      insurerCode: draft.insurerCode,
      insurerSlug: draft.insurerSlug,
      insurerName: draft.insurerName,
      channel: normalizeChannel(options?.channel),
      summary: draft.summary,
      publishedAt: draft.publishedAt,
      attachments: draft.attachments.map((a) => ({
        kind: a.kind,
        url: a.url,
        objectKey: a.objectKey,
        fileName: a.fileName,
        mimeType: a.mimeType,
        size: a.size,
        sortOrder: a.sortOrder,
      })),
    }),
  })
}

export async function deleteManagerNewsletter(
  token: string,
  newsletterId: string,
  options?: { channel?: NewsChannel },
): Promise<void> {
  const q = new URLSearchParams({ channel: normalizeChannel(options?.channel) })
  await apiRequest<void>(`/api/insurer-news/manager/newsletters/${encodeURIComponent(newsletterId)}?${q}`, {
    method: 'DELETE',
    token,
  })
}

export async function listManagerNewsletters(token: string, options?: { channel?: NewsChannel }): Promise<NewsletterItem[]> {
  const q = new URLSearchParams({ channel: normalizeChannel(options?.channel) })
  return apiRequest<NewsletterItem[]>(`/api/insurer-news/manager/newsletters?${q}`, { token })
}

export async function getManagerNewsletterDetail(
  token: string,
  id: string,
  options?: { channel?: NewsChannel },
): Promise<NewsletterDetail | null> {
  try {
    const q = new URLSearchParams({ channel: normalizeChannel(options?.channel) })
    return await apiRequest<NewsletterDetail>(`/api/insurer-news/manager/newsletters/${encodeURIComponent(id)}?${q}`, {
      token,
    })
  } catch {
    return null
  }
}

export async function deleteNewsletterAttachment(token: string, attachmentId: string): Promise<void> {
  await apiRequest<void>(`/api/insurer-news/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
    token,
  })
}

export async function getNewslettersForInsurerManagerCompany(
  token: string,
  gaCode: string,
  companyMasterId: number,
  options?: { channel?: NewsChannel },
): Promise<NewsletterItem[]> {
  const channel = normalizeChannel(options?.channel)
  if (channel === 'LOSS_ADJUSTER') {
    return listManagerNewsletters(token, { channel })
  }
  const rows = await listManagerNewsletters(token, { channel: options?.channel })
  const companies = await listCompanyDirectory(token)
  const entry = companies.find((r) => r.id === companyMasterId)
  if (!entry) {
    return []
  }
  return rows.filter((item) => isNewsletterInCompanyScope(item as NewsletterDetail, entry, gaCode))
}

export async function getNewsletterDetailForInsurerManager(
  token: string,
  gaCode: string,
  companyMasterId: number,
  newsletterId: string,
  options?: { channel?: NewsChannel },
): Promise<NewsletterDetail | null> {
  const channel = normalizeChannel(options?.channel)
  if (channel === 'LOSS_ADJUSTER') {
    return getManagerNewsletterDetail(token, newsletterId, { channel })
  }
  const detail = await getManagerNewsletterDetail(token, newsletterId, { channel: options?.channel })
  if (!detail) {
    return null
  }
  const companies = await listCompanyDirectory(token)
  const entry = companies.find((r) => r.id === companyMasterId)
  if (!entry || !isNewsletterInCompanyScope(detail, entry, gaCode)) {
    return null
  }
  return detail
}

export async function resolveInsurerManagerPublishContext(
  token: string,
  gaCode: string,
  companyMasterId: number,
  options?: { channel?: NewsChannel },
): Promise<PublishContextApi | { error: string }> {
  try {
    const channel = normalizeChannel(options?.channel)
    const apiCtx = await fetchPublishContextApi(token, { channel })
    if (apiCtx.gaCode.toUpperCase() !== gaCode.trim().toUpperCase()) {
      return { error: 'GA 정보가 일치하지 않습니다. 다시 로그인해 주세요.' }
    }
    if (channel === 'LOSS_ADJUSTER') {
      return {
        gaCode: apiCtx.gaCode.toUpperCase(),
        insurerCode: apiCtx.insurerCode,
        insurerName: apiCtx.insurerName,
        insurerSlug: apiCtx.insurerSlug,
      }
    }
    const rows = await listCompanyDirectory(token)
    const entry = rows.find((r) => r.id === companyMasterId)
    if (!entry) {
      return { error: '소속 원수사 정보를 찾을 수 없습니다. GA 관리자에게 문의해 주세요.' }
    }
    if (apiCtx.insurerCode.toUpperCase() !== entry.companyCode.trim().toUpperCase()) {
      return { error: '원수사 정보가 일치하지 않습니다. GA 관리자에게 문의해 주세요.' }
    }
    return {
      gaCode: apiCtx.gaCode.toUpperCase(),
      insurerCode: apiCtx.insurerCode,
      insurerName: apiCtx.insurerName,
      insurerSlug: apiCtx.insurerSlug,
    }
  } catch {
    return { error: '발행 컨텍스트를 불러오지 못했습니다. 다시 로그인해 주세요.' }
  }
}
