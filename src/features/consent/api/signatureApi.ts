import { apiRequest } from '../../../lib/apiClient'

export interface SaveSignatureRequest {
  signatureDataUrl: string
  signerType: 'USER' | 'CUSTOMER'
  signerId: string
  customerId?: number | null
  relatedType?: string | null
  relatedId?: string | null
  replaceSignatureId?: string | null
}

export interface SignatureRecord {
  id: string
  gaId: number
  customerId: number | null
  signerType: 'USER' | 'CUSTOMER'
  signerId: string
  relatedType: string | null
  relatedId: string | null
  fileKey: string
  status: 'active'
  previewUrl: string
}

export async function saveSignature(token: string, body: SaveSignatureRequest): Promise<SignatureRecord> {
  return apiRequest<SignatureRecord>('/api/signatures', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}
