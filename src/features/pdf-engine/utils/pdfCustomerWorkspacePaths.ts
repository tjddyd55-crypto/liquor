import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'

export type PdfDocumentsWorkspacePaths = {
  /** 고객 작업 영역에 embed된 PDF 신청서 흐름이면 고객 id, 아니면 null */
  workspaceCustomerId: number | null
  listPath: string
  historyPath: string
  /** 상대·절대 쿼리만 (앞의 ? 없이)issuerCustomerName 등 유지 시 */
  issuerQuerySuffix: string
}

function parsePositiveInt(raw: string | undefined): number | null {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** 목록 → 상세 링크, 쿼리 스트링은 호출측에서 `?${suffix}` 로 붙인다 */
export function buildPdfDocumentDetailHref(workspaceCustomerId: number | null, templateId: number): string {
  if (!Number.isInteger(templateId) || templateId < 1) {
    return workspaceCustomerId != null ? `/customers/${workspaceCustomerId}/application-documents` : '/application/documents'
  }
  if (workspaceCustomerId != null) {
    return `/customers/${workspaceCustomerId}/application-documents/${templateId}`
  }
  return `/application/documents/${templateId}`
}

export function appendQueryToHref(href: string, suffix: string): string {
  if (!suffix.trim()) return href
  const joiner = href.includes('?') ? '&' : '?'
  return `${href}${joiner}${suffix.replace(/^\?/, '')}`
}

/**
 * 라우트가 `/customers/:customerId/application-documents...` 계열일 때 embed 경로를 반환한다.
 */
export function usePdfDocumentsWorkspacePaths(): PdfDocumentsWorkspacePaths {
  const { customerId: paramCustomerId } = useParams<{ customerId?: string }>()
  const [searchParams] = useSearchParams()
  const issuerRaw = searchParams.get('issuerCustomerName')

  return useMemo(() => {
    const workspaceCustomerId = parsePositiveInt(paramCustomerId)
    const issuerName = issuerRaw?.trim()
    const issuerQuerySuffix = issuerName
      ? `issuerCustomerName=${encodeURIComponent(issuerName)}`
      : ''

    if (workspaceCustomerId != null) {
      const baseList = `/customers/${workspaceCustomerId}/application-documents`
      return {
        workspaceCustomerId,
        listPath: issuerQuerySuffix ? `${baseList}?${issuerQuerySuffix}` : baseList,
        historyPath: issuerQuerySuffix
          ? `/customers/${workspaceCustomerId}/application-documents/history?${issuerQuerySuffix}`
          : `/customers/${workspaceCustomerId}/application-documents/history`,
        issuerQuerySuffix,
      }
    }

    return {
      workspaceCustomerId: null,
      listPath: '/application/documents',
      historyPath: '/application/documents/history',
      issuerQuerySuffix,
    }
  }, [paramCustomerId, issuerRaw])
}
