/**
 * PDF.js worker 가 ArrayBuffer 를 transfer 하면 원본이 detach 된다.
 * 관리자 React state 등에 보관된 동일 버퍼를 재사용하면 byteLength 가 0 이 되고
 * 후속 파서·로그가 깨지므로, getDocument({ data }) 용 데이터는 항상 이 복사본을 쓴다.
 */
export function copyPdfBytesForPdfJs(source: ArrayBuffer): Uint8Array {
  return new Uint8Array(source.slice(0))
}

/** 진단·메시지 분기용 — 원인이 buffer 재사용/transfer 일 때 손상으로 오해되지 않게 한다. */
export function isLikelyDetachedArrayBufferError(error: unknown): boolean {
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  if (!msg) return false
  const lower = msg.toLowerCase()
  return (
    lower.includes('detached arraybuffer') ||
    lower.includes('perform construct on a detached arraybuffer') ||
    lower.includes('neutered arraybuffer') ||
    lower.includes('detached buffer')
  )
}
