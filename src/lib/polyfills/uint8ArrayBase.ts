/**
 * Uint8Array.prototype.{toHex, toBase64} / Uint8Array.fromBase64 polyfill.
 *
 * 배경:
 *   TC39 "Uint8Array to/from base64" (Stage-3) 제안은 Chrome 136+ / Safari 18.2+ /
 *   Node 22+ 에서 네이티브 제공된다. Electron 35.7.5 에 내장된 Chromium 134 에는
 *   아직 들어있지 않다. pdfjs-dist 5.x 는 이 API 를 내부적으로 사용하는데
 *   (특히 worker 의 PDF fingerprint 계산에서 `hash.toHex()`),
 *   런타임에 함수가 없으면 "a.toHex is not a function" 으로 즉시 실패한다.
 *
 * 적용 범위:
 *   - 메인 스레드: `src/main.tsx` 에서 한 번 side-effect import.
 *   - 워커 스레드: `src/lib/pdfjs/pdfWorkerEntry.ts` 에서 side-effect import 후
 *     pdfjs worker 를 import 한다 (워커의 Uint8Array.prototype 은 메인과 분리된
 *     별도 realm 이므로 양쪽 모두 주입해야 한다).
 *
 * 설계 원칙:
 *   - 네이티브 구현이 이미 있으면 절대 덮어쓰지 않는다 — 브라우저/노드 업그레이드 시
 *     자연스럽게 네이티브로 되돌아가야 한다.
 *   - 구현은 TC39 스펙에 최대한 충실. 다만 우리가 통제할 수 없는 환경에서의
 *     엣지 케이스(무효 입력 등)에 대해서는 spec-exact 한 throw 대신 pdfjs 가
 *     기대하는 "정상 에러 분기" 로 흐르도록 관대하게 둔다.
 *   - 대용량 바이너리(수 MB)를 다룰 때 `String.fromCharCode` 의 인자 수 상한을
 *     넘지 않도록 청크로 나눠 처리한다.
 *
 * 이후 변경은 어디에서?
 *   - Electron 36+ (Chromium 136+) 으로 업그레이드되면 이 파일을 유지할 필요가
 *     없다. 그때는 전체 파일 삭제 + 두 import 제거 한 번이면 된다. "네이티브가
 *     있으면 덮어쓰지 않는다" 원칙 덕에 업그레이드 중간 단계에서도 안전하다.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Base64Alphabet = 'base64' | 'base64url'
interface Base64Options {
  alphabet?: Base64Alphabet
  omitPadding?: boolean
}

const CHUNK_SIZE = 0x8000

function bytesToBinaryString(bytes: Uint8Array): string {
  /* String.fromCharCode 는 인자 개수에 런타임 상한이 있다. Chrome 기준 ~65k.
     청크로 나누면 어떤 크기의 버퍼든 안전하게 처리된다. */
  const parts: string[] = []
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const slice = bytes.subarray(i, i + CHUNK_SIZE)
    parts.push(String.fromCharCode.apply(null, Array.from(slice) as number[]))
  }
  return parts.join('')
}

function base64UrlToBase64(input: string): string {
  return input.replace(/-/g, '+').replace(/_/g, '/')
}

function base64ToBase64Url(input: string): string {
  return input.replace(/\+/g, '-').replace(/\//g, '_')
}

function padBase64(input: string): string {
  const remainder = input.length % 4
  return remainder === 0 ? input : input + '='.repeat(4 - remainder)
}

const proto = Uint8Array.prototype as any
const ctor = Uint8Array as any

if (typeof proto.toHex !== 'function') {
  proto.toHex = function toHex(this: Uint8Array): string {
    /* "0a1b..." 형태. 속도를 위해 join 대신 누적 문자열. */
    let out = ''
    for (let i = 0; i < this.length; i++) {
      const b = this[i]
      out += (b < 16 ? '0' : '') + b.toString(16)
    }
    return out
  }
}

if (typeof proto.toBase64 !== 'function') {
  proto.toBase64 = function toBase64(this: Uint8Array, options?: Base64Options): string {
    const binary = bytesToBinaryString(this)
    const encoded = typeof btoa === 'function'
      ? btoa(binary)
      : /* btoa 가 없는 환경(Node 테스트 등)에서는 Buffer 로 폴백. */
        (globalThis as any).Buffer
          ? (globalThis as any).Buffer.from(this).toString('base64')
          : (() => { throw new TypeError('No base64 encoder available') })()

    const urlVariant = options?.alphabet === 'base64url'
    const body = urlVariant ? base64ToBase64Url(encoded) : encoded
    return options?.omitPadding ? body.replace(/=+$/, '') : body
  }
}

if (typeof ctor.fromBase64 !== 'function') {
  ctor.fromBase64 = function fromBase64(input: string, options?: Base64Options): Uint8Array {
    if (typeof input !== 'string') {
      throw new TypeError('Uint8Array.fromBase64 expects a string')
    }
    const normalized = options?.alphabet === 'base64url' ? base64UrlToBase64(input) : input
    const padded = padBase64(normalized)
    const binary = typeof atob === 'function'
      ? atob(padded)
      : (globalThis as any).Buffer
          ? (globalThis as any).Buffer.from(padded, 'base64').toString('binary')
          : (() => { throw new TypeError('No base64 decoder available') })()

    const out = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i)
    }
    return out
  }
}

if (typeof ctor.fromHex !== 'function') {
  /* 현재 pdfjs-dist 5.6.x 에서는 직접 사용하지 않지만, 향후 패치 업데이트로
     호출이 추가될 가능성에 대비해 함께 제공한다. */
  ctor.fromHex = function fromHex(input: string): Uint8Array {
    if (typeof input !== 'string') {
      throw new TypeError('Uint8Array.fromHex expects a string')
    }
    if (input.length % 2 !== 0) {
      throw new SyntaxError('Invalid hex string length')
    }
    const out = new Uint8Array(input.length / 2)
    for (let i = 0; i < out.length; i++) {
      const byte = parseInt(input.substring(i * 2, i * 2 + 2), 16)
      if (Number.isNaN(byte)) {
        throw new SyntaxError('Invalid hex character')
      }
      out[i] = byte
    }
    return out
  }
}

export {}
