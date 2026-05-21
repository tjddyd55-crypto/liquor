/*
 * Temporary customer-detail cleanup guard.
 *
 * Recent mobile polish work added emoji prefixes to customer detail labels.
 * Most were removed by CSS, but section headings such as 자동차보험 정보,
 * 보험가입내역, 연계 고객 may have been rendered as plain text nodes.
 * CSS cannot hide part of a text node, so this tiny guard strips only leading
 * emoji prefixes inside customer detail content after render.
 *
 * Scope is intentionally narrow:
 * - Only customer detail areas are inspected.
 * - Only leading emoji/pictograph prefixes are removed.
 * - Business data, routes, APIs, and handlers are untouched.
 */

const CUSTOMER_DETAIL_SELECTORS = [
  '.customer-expand-detail',
  '.customer-detail-content',
  '.customer-detail-section',
  '.customer-detail-panel',
].join(',')

const LEADING_EMOJI_PREFIX_RE = /^(\s*)(?:[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]\uFE0F?\s*)+/u

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

export function initCustomerDetailEmojiCleanup() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return
  }

  const run = () => stripCustomerDetailEmojiPrefixes(document)

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) {
          if (node instanceof Text) {
            const parent = node.parentElement
            if (parent?.closest(CUSTOMER_DETAIL_SELECTORS)) {
              stripLeadingEmojiPrefixFromTextNode(node)
            }
          }
          continue
        }

        if (node.matches(CUSTOMER_DETAIL_SELECTORS)) {
          stripCustomerDetailEmojiPrefixes(node)
          continue
        }

        if (node.querySelector(CUSTOMER_DETAIL_SELECTORS)) {
          stripCustomerDetailEmojiPrefixes(node)
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })
}
