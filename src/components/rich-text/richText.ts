const ALLOWED_TAGS = new Set([
  'A',
  'B',
  'BR',
  'DIV',
  'EM',
  'FONT',
  'I',
  'LI',
  'OL',
  'P',
  'S',
  'SPAN',
  'STRONG',
  'U',
  'UL',
])

const ALLOWED_STYLE_PROPS = new Set([
  'background-color',
  'color',
  'font-size',
  'font-weight',
  'text-align',
  'text-decoration',
])

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function decodeHtmlEntities(value: string): string {
  const raw = String(value ?? '')
  if (!/[&](lt|gt|amp|quot|#039);/i.test(raw)) {
    return raw
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const textarea = document.createElement('textarea')
    textarea.innerHTML = raw
    return textarea.value
  }
  return raw
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;/gi, "'")
    .replace(/&amp;/gi, '&')
}

function looksLikeHtml(value: string): boolean {
  return /<[a-z][\s\S]*>/i.test(value)
}

function normalizeInputToHtml(value: string): string {
  const raw = decodeHtmlEntities(String(value ?? ''))
  if (looksLikeHtml(raw)) {
    return raw
  }
  return escapeHtml(raw).replace(/\r?\n/g, '<br>')
}

function isSafeCssValue(value: string): boolean {
  const v = value.trim()
  if (!v || v.length > 80) {
    return false
  }
  if (/url\s*\(|expression\s*\(|javascript:/i.test(v)) {
    return false
  }
  return /^[#(),.%\-\w\s가-힣]+$/u.test(v)
}

function sanitizeStyle(styleValue: string): string {
  const parts = []
  for (const declaration of styleValue.split(';')) {
    const [rawProp, ...rawValueParts] = declaration.split(':')
    const prop = String(rawProp ?? '').trim().toLowerCase()
    const value = rawValueParts.join(':').trim()
    if (!ALLOWED_STYLE_PROPS.has(prop) || !isSafeCssValue(value)) {
      continue
    }
    parts.push(`${prop}: ${value}`)
  }
  return parts.join('; ')
}

function sanitizeHref(value: string): string {
  const href = value.trim()
  if (!href) {
    return ''
  }
  if (/^(https?:|mailto:|tel:)/i.test(href)) {
    return href
  }
  return ''
}

function unwrapElement(element: Element): void {
  const parent = element.parentNode
  if (!parent) {
    element.remove()
    return
  }
  while (element.firstChild) {
    parent.insertBefore(element.firstChild, element)
  }
  element.remove()
}

function sanitizeElement(element: Element): void {
  const tagName = element.tagName.toUpperCase()
  if (!ALLOWED_TAGS.has(tagName)) {
    unwrapElement(element)
    return
  }

  for (const attr of Array.from(element.attributes)) {
    const name = attr.name.toLowerCase()
    const value = attr.value
    if (name.startsWith('on')) {
      element.removeAttribute(attr.name)
      continue
    }
    if (name === 'style') {
      const safeStyle = sanitizeStyle(value)
      if (safeStyle) {
        element.setAttribute('style', safeStyle)
      } else {
        element.removeAttribute(attr.name)
      }
      continue
    }
    if (tagName === 'A' && name === 'href') {
      const safeHref = sanitizeHref(value)
      if (safeHref) {
        element.setAttribute('href', safeHref)
        element.setAttribute('target', '_blank')
        element.setAttribute('rel', 'noreferrer')
      } else {
        element.removeAttribute(attr.name)
      }
      continue
    }
    if (tagName === 'FONT' && (name === 'color' || name === 'size')) {
      if (isSafeCssValue(value)) {
        continue
      }
      element.removeAttribute(attr.name)
      continue
    }
    element.removeAttribute(attr.name)
  }
}

export function sanitizeRichTextHtml(value: string): string {
  const input = normalizeInputToHtml(value)
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html')
  const root = doc.body.firstElementChild
  if (!root) {
    return ''
  }

  root.querySelectorAll('script, style, iframe, object, embed').forEach((node) => node.remove())

  let changed = true
  while (changed) {
    changed = false
    for (const element of Array.from(root.querySelectorAll('*'))) {
      const before = root.innerHTML
      sanitizeElement(element)
      if (root.innerHTML !== before) {
        changed = true
      }
    }
  }

  return root.innerHTML.trim()
}

export function stripRichText(value: string): string {
  const sanitized = sanitizeRichTextHtml(value)
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return sanitized.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const div = document.createElement('div')
  div.innerHTML = sanitized
  return String(div.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function isRichTextEmpty(value: string): boolean {
  return stripRichText(value).length === 0
}
