/**
 * PDF 출력에 쓸 한글 폰트 단일 소스.
 *
 * 동작:
 *   - server/fonts/NotoSansKR-Regular.{otf,ttf} 또는 env CONSENT_FONT_PATH 에서 로드.
 *   - 파일 바이트는 프로세스당 1회 읽고 모듈 캐시에 담아 재사용.
 *   - pdf-lib 의 embedFont 는 각 PDFDocument 에 종속이라 매 렌더마다 새로 임베드.
 *
 * 실패 전략:
 *   - 폰트 파일이 하나도 없으면 throw. 한글 스탬핑이 핵심 기능이라 silently Helvetica 로
 *     떨어지면 한글이 깨져 출력된다. 그럴 바에 500 으로 명확히 실패하는 게 안전하다.
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'

/** 검색 순서: 1) 환경변수 CONSENT_FONT_PATH (기존 동의서와 공유), 2) 프로젝트 번들 */
const FONT_CANDIDATES = [
  process.env.CONSENT_FONT_PATH,
  path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.otf'),
  path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.ttf'),
].filter(Boolean)

let cachedBytes = null
let cachedError = null

async function loadFontBytes() {
  if (cachedBytes) return cachedBytes
  if (cachedError) throw cachedError

  for (const candidate of FONT_CANDIDATES) {
    try {
      const bytes = await readFile(String(candidate))
      cachedBytes = bytes
      return bytes
    } catch {
      /* try next candidate */
    }
  }

  cachedError = new Error(
    'PDF 렌더링에 필요한 한글 폰트 파일을 찾을 수 없습니다. ' +
      'server/fonts/NotoSansKR-Regular.otf 를 두거나 CONSENT_FONT_PATH 환경변수에 절대 경로를 지정하세요.',
  )
  throw cachedError
}

/**
 * PDFDocument 에 한글 폰트를 임베드한다. 첫 호출 때 fontkit 을 등록한다.
 *
 * @param {import('pdf-lib').PDFDocument} pdfDoc
 * @returns {Promise<import('pdf-lib').PDFFont>}
 */
export async function embedKoreanFont(pdfDoc) {
  const bytes = await loadFontBytes()
  pdfDoc.registerFontkit(fontkit)
  /*
   * 일부 환경에서 subset=true 일 때 한글 글리프가 누락되어
   * 숫자만 보이고 한글이 비어 보이는 케이스가 보고되어 전체 폰트 임베드로 고정한다.
   * (파일 크기는 다소 증가하지만 출력 정확성을 우선)
   */
  return pdfDoc.embedFont(bytes, { subset: false })
}
