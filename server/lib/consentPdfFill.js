import { readFile } from 'node:fs/promises'
import path from 'node:path'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const DEFAULT_FONT_CANDIDATES = [
  process.env.CONSENT_FONT_PATH,
  path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.otf'),
  path.join(process.cwd(), 'server/fonts/NotoSansKR-Regular.ttf'),
].filter(Boolean)

async function tryLoadEmbeddedFont(pdfDoc) {
  let registered = false
  for (const p of DEFAULT_FONT_CANDIDATES) {
    try {
      const bytes = await readFile(String(p))
      if (!registered) {
        pdfDoc.registerFontkit(fontkit)
        registered = true
      }
      return await pdfDoc.embedFont(bytes)
    } catch {
      /* try next */
    }
  }
  return null
}

/**
 * fields: 좌표는 PDF user space, 원점 좌하단
 * @param {Buffer} templatePdfBytes
 * @param {unknown} fieldsRaw
 * @param {Record<string, string>} formData
 * @param {Buffer | null} signaturePng
 */
export async function fillConsentPdf(templatePdfBytes, fieldsRaw, formData, signaturePng) {
  const fields = Array.isArray(fieldsRaw) ? fieldsRaw : []
  const pdfDoc = await PDFDocument.load(templatePdfBytes)
  const customFont = await tryLoadEmbeddedFont(pdfDoc)
  const font = customFont ?? (await pdfDoc.embedFont(StandardFonts.Helvetica))

  const pages = pdfDoc.getPages()
  if (pages.length === 0) {
    throw new Error('템플릿 PDF에 페이지가 없습니다.')
  }

  for (const field of fields) {
    if (!field || typeof field !== 'object') {
      continue
    }
    const type = String(field.type ?? '')
    const pageIdx = Number.isFinite(Number(field.page)) ? Math.max(0, Number(field.page)) : 0
    const page = pages[pageIdx]
    if (!page) {
      continue
    }
    const x = Number(field.x)
    const y = Number(field.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue
    }

    if (type === 'text') {
      const key = String(field.key ?? '')
      const value = String(formData[key] ?? '')
      const fontSize = Number.isFinite(Number(field.fontSize)) ? Number(field.fontSize) : 12
      if (!customFont && /[^\u0000-\u00ff]/.test(value)) {
        throw new Error(
          '한글 등 유니코드 텍스트는 서버에 한글 폰트 파일이 필요합니다. server/fonts/NotoSansKR-Regular.otf 를 두거나 CONSENT_FONT_PATH 를 설정하세요.',
        )
      }
      page.drawText(value, { x, y, size: fontSize, font, color: rgb(0, 0, 0) })
    }

    if (type === 'signature' && signaturePng && signaturePng.length > 0) {
      const png = await pdfDoc.embedPng(signaturePng)
      const w = Number.isFinite(Number(field.width)) ? Number(field.width) : 120
      const h = Number.isFinite(Number(field.height)) ? Number(field.height) : 50
      page.drawImage(png, { x, y, width: w, height: h })
    }
  }

  const out = await pdfDoc.save()
  return Buffer.from(out)
}
