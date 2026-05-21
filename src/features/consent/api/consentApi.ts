import { apiRequest } from '../../../lib/apiClient'

export interface ConsentGenerateBody {
  consent_template_id: string
  formData: {
    name: string
    ssn: string
    phone: string
  }
  signature: string | null
}

export interface ConsentGenerateResponse {
  pdfUrl: string
}

export async function generateConsentPdf(
  token: string,
  body: ConsentGenerateBody,
): Promise<ConsentGenerateResponse> {
  return apiRequest<ConsentGenerateResponse>('/api/consent/generate', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
}
