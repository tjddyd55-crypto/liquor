export function isActivePcNavigationPath(pathname: string, itemPath: string): boolean {
  if (itemPath === '/contacts') {
    return pathname === '/contacts' || pathname === '/insurance/contacts'
  }
  if (itemPath === '/insurance/contacts') {
    return pathname === '/insurance/contacts' || pathname === '/contacts'
  }
  if (itemPath === '/portal/newsletters') {
    return pathname === '/portal/newsletters' || pathname.startsWith('/portal/newsletters/')
  }
  if (itemPath === '/portal/adjuster-news') {
    return pathname === '/portal/adjuster-news' || pathname.startsWith('/portal/adjuster-news/')
  }
  if (itemPath === '/contacts/manage') {
    return pathname === '/contacts/manage' || pathname === '/insurance/company-registry'
  }
  if (itemPath === '/insurance/company-registry') {
    return pathname === '/insurance/company-registry' || pathname.startsWith('/insurance/company-registry/')
  }
  if (itemPath.startsWith('/customers')) {
    return pathname === '/customers' || pathname.startsWith('/customers/') || pathname.startsWith('/customer/')
  }
  if (itemPath === '/application') {
    return pathname === '/application' || pathname.startsWith('/application/')
  }
  if (itemPath === '/application/documents') {
    if (pathname.startsWith('/application/documents/history')) {
      return false
    }
    return pathname === '/application/documents' || pathname.startsWith('/application/documents/')
  }
  if (itemPath === '/application/documents/history') {
    return (
      pathname === '/application/documents/history' ||
      pathname.startsWith('/application/documents/history/')
    )
  }
  if (itemPath === '/feature-request') {
    return pathname === '/feature-request' || pathname === '/feature-requests/my'
  }
  if (itemPath === '/account/reset') {
    return pathname === '/account/reset'
  }
  if (itemPath === '/profile') {
    return pathname === '/profile'
  }
  if (itemPath.startsWith('/internal/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  if (itemPath === '/admin/analytics') {
    return pathname === '/admin/analytics'
  }
  if (itemPath === '/admin/ga') {
    return pathname === '/admin/ga' || pathname === '/admin/create-ga'
  }
  if (itemPath === '/admin/delegates') {
    return pathname === '/admin/delegates' || pathname === '/admin/create-staff'
  }
  if (itemPath === '/insurer-managers') {
    return pathname === '/insurer-managers'
  }
  if (itemPath === '/loss-adjusters') {
    return pathname === '/loss-adjusters'
  }
  if (itemPath === '/insurer/news') {
    if (pathname.startsWith('/insurer/news/upload')) {
      return false
    }
    return pathname === '/insurer/news' || pathname.startsWith('/insurer/news/')
  }
  if (itemPath === '/insurer/news/upload') {
    return pathname === '/insurer/news/upload'
  }
  if (itemPath === '/adjuster/news') {
    if (pathname.startsWith('/adjuster/news/upload')) {
      return false
    }
    return pathname === '/adjuster/news' || pathname.startsWith('/adjuster/news/')
  }
  if (itemPath === '/adjuster/news/upload') {
    return pathname === '/adjuster/news/upload'
  }
  if (itemPath === '/admin/audit-logs') {
    return pathname === '/admin/audit-logs'
  }
  if (itemPath === '/insurance/insurer-sites') {
    return pathname === '/insurance/insurer-sites'
  }
  if (itemPath === '/admin/insurer-sites') {
    return pathname === '/admin/insurer-sites'
  }
  if (itemPath === '/team/manage' || itemPath === '/team/menu-settings' || itemPath === '/team/admin') {
    return pathname === '/team/members' || pathname === itemPath || pathname.startsWith('/team/members/')
  }
  if (itemPath.startsWith('/team/')) {
    return pathname === itemPath || pathname.startsWith(`${itemPath}/`)
  }
  return pathname === itemPath
}
