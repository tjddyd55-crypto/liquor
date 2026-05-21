export type DownloadLinkMap = {
  pc: string
  fcMobile: string
  customerApp: string
  sampleExcel: string
}

const DEFAULT_DOWNLOAD_LINKS: DownloadLinkMap = Object.freeze({
  pc: 'https://cdn.platform-assets.com/insurer/download/InsuranceApp%20Setup%201.0.7.exe',
  fcMobile: 'https://cdn.platform-assets.com/insurer/download/FC-app-release.apk',
  customerApp: 'https://cdn.platform-assets.com/insurer/download/customer-app-release.apk',
  sampleExcel: '',
})

function normalizeLink(value: unknown, fallback: string): string {
  const text = String(value ?? '').trim()
  return text || fallback
}

export const DOWNLOAD_LINKS: DownloadLinkMap = Object.freeze({
  pc: normalizeLink(import.meta.env.VITE_DOWNLOAD_PC_URL, DEFAULT_DOWNLOAD_LINKS.pc),
  fcMobile: normalizeLink(import.meta.env.VITE_DOWNLOAD_FC_MOBILE_URL, DEFAULT_DOWNLOAD_LINKS.fcMobile),
  customerApp: normalizeLink(import.meta.env.VITE_DOWNLOAD_CUSTOMER_APP_URL, DEFAULT_DOWNLOAD_LINKS.customerApp),
  sampleExcel: normalizeLink(import.meta.env.VITE_DOWNLOAD_SAMPLE_EXCEL_URL, DEFAULT_DOWNLOAD_LINKS.sampleExcel),
})
