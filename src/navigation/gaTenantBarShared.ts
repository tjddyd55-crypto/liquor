/** Web GA bar / Electron title bar: shared tenant chrome visibility. */

export const HIDE_GA_BAR_PATHS = new Set<string>([
  '/login',
  '/register',
  '/password-reset',
  '/customer/input',
  '/customer/register',
])

export function formatGaBannerLabel(gaName: string, gaCode: string): string {
  const n = gaName.trim()
  if (n) {
    const compact = n.replace(/\s+/g, '')
    if (/GA$/i.test(compact)) {
      return n
    }
    return `${n} GA`
  }
  const c = gaCode.trim()
  return c ? `${c} GA` : 'GA'
}

export function shouldShowGaTenantChrome(
  isAuthenticated: boolean,
  gaId: unknown,
  pathname: string,
): boolean {
  return Boolean(isAuthenticated && gaId != null) && !HIDE_GA_BAR_PATHS.has(pathname)
}
