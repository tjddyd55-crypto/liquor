/*
 * Mobile runtime cleanup guard.
 *
 * Mobile-only visual cleanup while overlapping polish CSS is being consolidated:
 * - Strip remaining leading emoji prefixes from customer detail text/section titles.
 * - Hide raw claim link code/URL rows on mobile.
 * - Hide only the inline selected-claim detail card on the mobile claim main screen,
 *   while preserving the claim request list and the full-screen detail modal.
 *
 * Important: this file must not remove generic svg/img/aria-hidden nodes, because
 * copy/edit/delete action controls also use those nodes for their icons.
 */

const MOBILE_MEDIA_QUERY = '(max-width: 767px)'
const CUSTOMER_DETAIL_SELECTORS = [
  '.customer-expand-detail',
  '.customer-detail-content',
  '.customer-detail-section',
  '.customer-detail-panel',
].join(',')

const LEADING_EMOJI_PREFIX_RE = /^(\s*)(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s*)+/u

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

function stripLeadingEmojiPrefixFromTextNode(node: Text) {
  const value = node.nodeValue ?? ''
  if (!value.trim()) {
    return
  }
  const nextValue = value.replace(LEADING_EMOJI_PREFIX_RE, '$1')
  if (nextValue !== value) {
    node.nodeValue = nextValue
  }
}

function stripCustomerDetailEmojiPrefixes(root: ParentNode = document) {
  const detailRoots = Array.from(root.querySelectorAll?.(CUSTOMER_DETAIL_SELECTORS) ?? [])
  for (const detailRoot of detailRoots) {
    const walker = document.createTreeWalker(detailRoot, NodeFilter.SHOW_TEXT)
    let current = walker.nextNode()
    while (current) {
      stripLeadingEmojiPrefixFromTextNode(current as Text)
      current = walker.nextNode()
    }
  }
}

function closestHideableRow(labelEl: Element): HTMLElement | null {
  let current: HTMLElement | null = labelEl.parentElement
  let depth = 0
  while (current && depth < 5) {
    const text = current.textContent ?? ''
    const hasRawLabel = text.includes('연결 코드') || text.includes('연결 URL')
    const hasReadonlyControl = Boolean(current.querySelector('input[readonly], textarea[readonly]'))
    const hasCopyButton = text.includes('복사')
    if (hasRawLabel && (hasReadonlyControl || hasCopyButton)) {
      return current
    }
    current = current.parentElement
    depth += 1
  }
  return null
}

function hideMobileClaimRawLinkRows(root: ParentNode = document) {
  if (!isMobileViewport()) {
    return
  }
  const pages = Array.from(root.querySelectorAll?.('.claim-requests-page--mobile') ?? [])
  for (const page of pages) {
    page.querySelectorAll('label, div, p, span').forEach((node) => {
      const text = (node.textContent ?? '').trim()
      if (text !== '연결 코드' && text !== '연결 URL') {
        return
      }
      const row = closestHideableRow(node)
      if (row) {
        row.style.display = 'none'
      }
    })
  }
}

function findClaimDetailCard(titleEl: HTMLElement, page: Element): HTMLElement | null {
  let current: HTMLElement | null = titleEl
  let depth = 0
  while (current && current !== page && depth < 6) {
    const parent = current.parentElement
    if (!parent || parent === page) {
      return current
    }
    const parentText = parent.textContent ?? ''
    const parentHasClaimList = parentText.includes('청구 요청 목록')
    const parentHasLinkPanel = parentText.includes('링크 발송') || parentText.includes('연결 상태')
    if (parentHasClaimList || parentHasLinkPanel) {
      return current
    }
    current = parent
    depth += 1
  }
  return null
}

function hideInlineSelectedClaimDetail(root: ParentNode = document) {
  if (!isMobileViewport()) {
    return
  }
  const pages = Array.from(root.querySelectorAll?.('.workspace-mobile-outlet-modal__body .claim-requests-page--mobile') ?? [])
  for (const page of pages) {
    page.querySelectorAll('h1, h2, h3, h4, header, section > div:first-child, article > div:first-child, div').forEach((node) => {
      const el = node as HTMLElement
      if (el.closest('.customer-ui-modal-backdrop')) {
        return
      }
      if ((el.textContent ?? '').trim() !== '선택한 청구 요청 상세') {
        return
      }
      const card = findClaimDetailCard(el, page)
      if (card) {
        card.style.display = 'none'
      }
    })
  }
}

function runMobileRuntimeCleanup(root: ParentNode = document) {
  stripCustomerDetailEmojiPrefixes(root)
  hideMobileClaimRawLinkRows(root)
  hideInlineSelectedClaimDetail(root)
}

export function initMobileRuntimeCleanup() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const run = () => runMobileRuntimeCleanup(document)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }

  window.addEventListener('resize', run)
  window.setTimeout(run, 0)
  window.setTimeout(run, 250)
  window.setTimeout(run, 1000)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof Element) {
          runMobileRuntimeCleanup(node)
        }
      }
    }
    run()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}
