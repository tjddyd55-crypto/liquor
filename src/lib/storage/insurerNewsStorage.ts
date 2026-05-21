/**
 * 원수사 소식지 첨부 — R2 presign / 확인 플로우 placeholder.
 * 서버는 기존과 동일하게 R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_ACCESS_KEY_ID,
 * R2_SECRET_ACCESS_KEY, R2_ENDPOINT 를 사용한다.
 *
 * TODO(insurer-news): 클라이언트에서는 presign 요청 전용 API를 호출한다.
 * import.meta.env 에 R2 시크릿을 넣지 않는다.
 */

export interface InsurerNewsletterPresignRequest {
  gaCode: string
  insurerCode: string
  newsletterId: string
  fileName: string
  contentType: string
  byteSize: number
}

export interface InsurerNewsletterPresignResponse {
  uploadUrl: string
  objectKey: string
  /** TODO(insurer-news): 실제 연결 시 필요한 헤드 필드 */
  headers?: Record<string, string>
}

export interface InsurerNewsletterConfirmRequest {
  objectKey: string
  newsletterId: string
}

export async function createInsurerNewsletterUploadUrl(
  _request: InsurerNewsletterPresignRequest,
): Promise<InsurerNewsletterPresignResponse> {
  void _request
  // TODO(insurer-news): POST /api/.../insurer-news/presign 등으로 교체
  throw new Error('업로드 URL 발급 API 연결이 필요합니다. (TODO: presign)')
}

export async function confirmInsurerNewsletterUpload(
  _request: InsurerNewsletterConfirmRequest,
): Promise<void> {
  void _request
  // TODO(insurer-news): 서버에 객체 존재 확인·DB 메타 등록
  throw new Error('업로드 확인 API 연결이 필요합니다. (TODO: confirm)')
}
