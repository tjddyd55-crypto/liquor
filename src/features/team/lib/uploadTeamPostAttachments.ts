import { cdnUrlForObjectKey } from '../../insurer-news/lib/insurerNewsCdn'
import { presignTeamPostAttachment } from '../api/teamApi'

export function guessTeamPostContentType(file: File): string {
  if (file.type) {
    return file.type
  }
  const n = file.name.toLowerCase()
  if (n.endsWith('.pdf')) {
    return 'application/pdf'
  }
  if (n.endsWith('.png')) {
    return 'image/png'
  }
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (n.endsWith('.webp')) {
    return 'image/webp'
  }
  if (n.endsWith('.gif')) {
    return 'image/gif'
  }
  return 'application/octet-stream'
}

export async function uploadTeamPostFiles(
  token: string,
  files: File[],
): Promise<{ objectKey: string; fileName: string; fileUrl: string }[]> {
  const out: { objectKey: string; fileName: string; fileUrl: string }[] = []
  for (const file of files) {
    const contentType = guessTeamPostContentType(file)
    const presign = await presignTeamPostAttachment(token, {
      fileName: file.name,
      contentType,
      sizeBytes: file.size,
    })
    const headers: Record<string, string> = {
      'Content-Type': contentType,
      ...(presign.putHeaders ?? {}),
    }
    const put = await fetch(presign.uploadUrl, { method: 'PUT', headers, body: file })
    if (!put.ok) {
      throw new Error('파일 업로드에 실패했습니다.')
    }
    out.push({
      objectKey: presign.objectKey,
      fileName: file.name,
      fileUrl: cdnUrlForObjectKey(presign.objectKey),
    })
  }
  return out
}
