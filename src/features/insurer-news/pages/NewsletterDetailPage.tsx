import { InsurerManagerNewsDetailPage } from './InsurerManagerNewsDetailPage'
import type { NewsChannel } from '../types'

export function NewsletterDetailPage({
  channel = 'INSURER',
  listPath = '/portal/newsletters',
}: {
  channel?: NewsChannel
  listPath?: string
}) {
  return <InsurerManagerNewsDetailPage channel={channel} listPath={listPath} detailScope="ga" />
}
