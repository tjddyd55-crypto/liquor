import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

const EXPORT_SCALE = 2
const RESULT_FORM_WIDTH = 794
const EXPORT_RENDER_ATTR = 'data-export-render-id'
const EXPORT_RENDER_MODE_CLASS = 'result-export-mode'

function createSafeFileName(input: string): string {
  return input
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80)
}

async function waitForStableRender(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready
  }

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}

async function renderResultCanvas(targetElement: HTMLElement): Promise<HTMLCanvasElement> {
  await waitForStableRender()

  const renderId = `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  targetElement.setAttribute(EXPORT_RENDER_ATTR, renderId)
  try {
    return await html2canvas(targetElement, {
      scale: EXPORT_SCALE,
      useCORS: true,
      width: RESULT_FORM_WIDTH,
      windowWidth: RESULT_FORM_WIDTH,
      backgroundColor: '#ffffff',
      scrollX: 0,
      scrollY: -window.scrollY,
      onclone: (clonedDocument) => {
        const clonedRoot = clonedDocument.querySelector<HTMLElement>(
          `[${EXPORT_RENDER_ATTR}="${renderId}"]`,
        )
        clonedRoot?.classList.add(EXPORT_RENDER_MODE_CLASS)
      },
    })
  } finally {
    targetElement.removeAttribute(EXPORT_RENDER_ATTR)
  }
}

async function renderResultAsJpegDataUrl(targetElement: HTMLElement): Promise<string> {
  const canvas = await renderResultCanvas(targetElement)
  return canvas.toDataURL('image/jpeg', 0.98)
}

export async function createResultJpgFile(
  targetElement: HTMLElement,
  title: string,
): Promise<File> {
  const dataUrl = await renderResultAsJpegDataUrl(targetElement)
  const blob = await (await fetch(dataUrl)).blob()

  return new File([blob], `${createSafeFileName(title)}.jpg`, {
    type: 'image/jpeg',
  })
}

export async function exportResultToJpg(
  targetElement: HTMLElement,
  title: string,
): Promise<void> {
  const dataUrl = await renderResultAsJpegDataUrl(targetElement)

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `${createSafeFileName(title)}.jpg`
  link.click()
}

export async function exportResultToPdf(
  targetElement: HTMLElement,
  title: string,
): Promise<void> {
  const canvas = await renderResultCanvas(targetElement)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.98)

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height)
  const renderWidth = canvas.width * ratio
  const renderHeight = canvas.height * ratio
  const x = (pageWidth - renderWidth) / 2
  const y = (pageHeight - renderHeight) / 2

  pdf.addImage(dataUrl, 'JPEG', x, y, renderWidth, renderHeight)
  pdf.save(`${createSafeFileName(title)}.pdf`)
}
