import { isCustomerPdfCarFieldKey } from '../config/customerPdfFieldOptions'
import { normalizePdfFieldDataMapping } from './resolvePdfFieldValue'
import type { PdfFieldSpec } from '../types'

/** 템플릿 필드에 고객 차량 관련 customerFieldKey 매핑이 하나라도 있는지 */
export function hasCarMappedFields(fields: PdfFieldSpec[]): boolean {
  for (const f of fields) {
    const dm = normalizePdfFieldDataMapping(f.dataMapping)
    if (
      dm.dataSourceType === 'customer' &&
      dm.customerFieldKey &&
      isCustomerPdfCarFieldKey(dm.customerFieldKey)
    ) {
      return true
    }
  }
  return false
}
