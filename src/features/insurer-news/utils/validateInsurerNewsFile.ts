import {
  INSURER_NEWS_ALLOWED_IMAGE_MIME,
  INSURER_NEWS_ALLOWED_PDF_MIME,
  INSURER_NEWS_MAX_IMAGE_BYTES,
  INSURER_NEWS_MAX_PDF_BYTES,
} from '../constants/attachmentUploadPolicy'

const IMAGE_TYPES = new Set<string>(INSURER_NEWS_ALLOWED_IMAGE_MIME)
const PDF_TYPES = new Set<string>(INSURER_NEWS_ALLOWED_PDF_MIME)

const MAX_IMAGE_BYTES = INSURER_NEWS_MAX_IMAGE_BYTES
const MAX_PDF_BYTES = INSURER_NEWS_MAX_PDF_BYTES

export type InsurerNewsFileKind = 'image' | 'file'

export interface ValidateInsurerNewsFileResult {
  ok: true
  kind: InsurerNewsFileKind
}

export interface ValidateInsurerNewsFileError {
  ok: false
  message: string
}

export function validateInsurerNewsFile(file: File): ValidateInsurerNewsFileResult | ValidateInsurerNewsFileError {
  const type = file.type || ''
  if (IMAGE_TYPES.has(type)) {
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, message: '이미지는 10MB 이하만 업로드할 수 있습니다.' }
    }
    return { ok: true, kind: 'image' }
  }
  if (PDF_TYPES.has(type)) {
    if (file.size > MAX_PDF_BYTES) {
      return { ok: false, message: 'PDF는 10MB 이하만 업로드할 수 있습니다.' }
    }
    return { ok: true, kind: 'file' }
  }
  return {
    ok: false,
    message: 'JPG, PNG, WEBP, GIF 이미지 또는 PDF만 업로드할 수 있습니다.',
  }
}
