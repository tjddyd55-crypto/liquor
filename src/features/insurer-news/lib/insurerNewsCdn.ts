/** 서버 `getR2PublicCdnBase`와 동일한 기본값 */
export function getInsurerNewsCdnBase(): string {
  const raw = import.meta.env.VITE_R2_PUBLIC_CDN_BASE as string | undefined
  return String(raw ?? 'https://cdn.platform-assets.com').replace(/\/$/, '')
}

export function cdnUrlForObjectKey(objectKey: string): string {
  return `${getInsurerNewsCdnBase()}/${objectKey.replace(/^\//, '')}`
}
