/**
 * pdf.js 가 CMap·표준 폰트를 worker 에서 fetch 하도록 절대 URL 을 넘긴다.
 * 로컬 미러가 없을 때는 pdfjs-dist 버전에 맞춘 unpkg 정적 파일을 사용한다(관리자 화면 전용).
 */
import { version as pdfjsDistVersion } from 'pdfjs-dist'

export function getPdfJsCmapAndStandardFontUrls(): { cMapUrl: string; standardFontDataUrl: string } {
  const v = pdfjsDistVersion.trim()
  return {
    cMapUrl: `https://unpkg.com/pdfjs-dist@${v}/cmaps/`,
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${v}/standard_fonts/`,
  }
}
